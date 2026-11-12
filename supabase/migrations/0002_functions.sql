-- Avilo server functions. Each one checks who is calling before it writes anything.

-- The single door into the ledger. Validates the event against current stock.
create or replace function public._ingest(e jsonb, p_actor uuid, p_source text default 'Avilo') returns bigint
language plpgsql security definer set search_path = public as $$
declare t text := e->>'type'; it items; p parts; q numeric := coalesce((e->>'qty')::numeric, 1); new_id bigint;
begin
  select * into p from parts where pn = e->>'pn';
  if p.pn is null then raise exception 'Unknown part number %.', e->>'pn'; end if;
  if t not in ('RECEIVE', 'TURN_IN', 'TRANSFER_IN') then
    select * into it from items where id = e->>'item';
    if it.id is null then raise exception 'No stock record for %.', e->>'item'; end if;
  end if;
  if t = 'ISSUE' then
    if it.cond <> 'serviceable' then raise exception '% is % and cannot be issued.', it.id, it.cond; end if;
    if it.loc is distinct from e->>'from' then raise exception '% is not at %.', it.id, e->>'from'; end if;
    if q > it.qty then raise exception 'Only % % left in %.', it.qty, p.unit, it.id; end if;
    if it.reserved is not null and it.reserved is distinct from e->>'ref' then raise exception '% is reserved for %.', it.id, it.reserved; end if;
  elsif t = 'TRANSFER_OUT' then
    if it.transit is not null then raise exception '% is already in transit.', it.id; end if;
    if it.cond in ('issued', 'scrapped', 'pending') then raise exception '% cannot be transferred while %.', it.id, it.cond; end if;
    if it.loc is distinct from e->>'from' then raise exception '% is not at %.', it.id, e->>'from'; end if;
    if q > it.qty then raise exception 'Only % available.', it.qty; end if;
  elsif t in ('RECEIVE', 'TURN_IN') then
    if coalesce(e->>'item', '') = '' then raise exception 'Enter a serial or batch number.'; end if;
    if exists (select 1 from items where id = e->>'item') then raise exception '% already exists in the ledger.', e->>'item'; end if;
  elsif t = 'TRANSFER_IN' then
    if not exists (select 1 from items where transit->>'trf' = e->>'trf') then raise exception 'Transfer % is not in transit.', e->>'trf'; end if;
  elsif t = 'VERIFY' then
    if it.cond <> 'pending' then raise exception '% is not waiting for inspection.', it.id; end if;
  end if;
  insert into events(type, item, pn, qty, from_st, to_st, trf, ref, aircraft, cond, cert, reason, expiry, actor, source)
  values (t, e->>'item', p.pn, q, e->>'from', e->>'to', e->>'trf', e->>'ref', e->>'aircraft', e->>'cond', e->>'cert', e->>'reason',
          (e->>'expiry')::timestamptz, p_actor, p_source)
  returning id into new_id;
  return new_id;
end $$;

-- Events people post directly: stock movements (stores) and condition changes (compliance).
create or replace function public.ingest(e jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); t text := e->>'type'; st text; recv uuid; new_id bigint;
begin
  if t in ('RECEIVE', 'TURN_IN', 'TRANSFER_IN', 'TRANSFER_OUT', 'ISSUE') then
    if r.role <> 'operator' then raise exception 'Only stores operators record stock movements.'; end if;
    st := case when t in ('TRANSFER_OUT', 'ISSUE') then e->>'from' else e->>'to' end;
    if t = 'TRANSFER_IN' then select transit->>'to' into st from items where transit->>'trf' = e->>'trf' limit 1; end if;
    if st is null or not (st = any (r.scope)) then raise exception 'Your location scope does not include %.', coalesce(st, 'that station'); end if;
  elsif t in ('VERIFY', 'CONDITION', 'SCRAP') then
    if r.role <> 'compliance' then raise exception 'Only the Compliance Officer can change part condition.'; end if;
    if t = 'VERIFY' then
      select actor into recv from events where item = e->>'item' and type = 'RECEIVE' order by id desc limit 1;
      if recv = r.id then raise exception 'You received this part, so another inspector must verify it.'; end if;
    end if;
    if t = 'CONDITION' and coalesce(e->>'reason', '') = '' then raise exception 'Give a reason for the condition change.'; end if;
  else
    raise exception 'Event type % cannot be posted directly.', t;
  end if;
  new_id := _ingest(e, r.id, 'Avilo');
  perform _audit(r.id, case t when 'RECEIVE' then 'Received part' when 'TURN_IN' then 'Turned in part' when 'TRANSFER_IN' then 'Confirmed transfer receipt'
    when 'TRANSFER_OUT' then 'Sent transfer' when 'ISSUE' then 'Issued part' when 'VERIFY' then 'Verified certificate'
    when 'CONDITION' then 'Changed condition' else 'Scrapped part' end,
    coalesce(e->>'item', e->>'trf'), concat_ws(' · ', e->>'from', e->>'to', e->>'cond', e->>'reason'));
  return new_id;
end $$;

-- Scanner simulator: posts a consumable issue through the same door as a real scanner.
create or replace function public.scanner_tick() returns bigint
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); b items;
begin
  if r.role = 'supplier' then raise exception 'Not available to suppliers.'; end if;
  select i.* into b from items i join parts p on p.pn = i.pn
   where p.type = 'consumable' and i.cond = 'serviceable' and i.loc is not null and i.reserved is null and i.qty > 6
   order by random() limit 1;
  if b.id is null then return null; end if;
  return _ingest(jsonb_build_object('type', 'ISSUE', 'item', b.id, 'pn', b.pn, 'qty', 1 + floor(random() * 3)::int, 'from', b.loc,
    'ref', 'WO-89' || (100 + floor(random() * 899)::int), 'aircraft', (array['AVL-01','AVL-03','AVL-05','AVL-06'])[1 + floor(random() * 4)::int]),
    null, 'Scanner simulator');
end $$;

-- Part requests. AOG requests reserve the nearest serviceable unit at once.
create or replace function public.raise_request(p_pn text, p_station text, p_aircraft text, p_wo text, p_priority text) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); rid text; it items; from_st text; best_loc text;
begin
  if r.role not in ('technician', 'planner') then raise exception 'Your role cannot raise part requests.'; end if;
  if r.role = 'technician' and not (p_station = any (r.scope)) then raise exception 'You can raise requests only for your own station.'; end if;
  if p_priority not in ('Routine', 'AOG') then raise exception 'Priority must be Routine or AOG.'; end if;
  if not exists (select 1 from parts where pn = p_pn) then raise exception 'Unknown part number %.', p_pn; end if;
  rid := 'REQ-' || nextval('req_seq');
  insert into requests(id, pn, qty, station, aircraft, wo, priority, by_user, note)
  values (rid, p_pn, 1, p_station, p_aircraft, p_wo, p_priority, r.id, case when p_priority = 'AOG' then 'Aircraft on ground.' else '' end);
  perform _audit(r.id, 'Raised part request', rid, p_pn || ' for ' || p_aircraft || ' at ' || p_station || ' · ' || p_priority);
  if p_priority <> 'AOG' then return rid || ' raised for ' || p_aircraft || '.'; end if;
  from_st := p_station;
  select * into it from items where pn = p_pn and loc = p_station and cond = 'serviceable' and reserved is null and transit is null and qty >= 1 limit 1;
  if it.id is null then
    select loc into best_loc from items where pn = p_pn and cond = 'serviceable' and reserved is null and loc is not null and loc <> p_station
     group by loc order by sum(qty) desc limit 1;
    if best_loc is not null then
      select * into it from items where pn = p_pn and loc = best_loc and cond = 'serviceable' and reserved is null and qty >= 1 limit 1;
      from_st := best_loc;
    end if;
  end if;
  if it.id is null then return rid || ' raised. No serviceable unit anywhere: it now drives an AOG reorder recommendation.'; end if;
  perform _ingest(jsonb_build_object('type', 'RESERVE', 'item', it.id, 'pn', p_pn, 'ref', rid), r.id, 'Avilo');
  if from_st <> p_station then
    insert into tasks(pn, qty, from_st, to_st, req, why) values (p_pn, 1, from_st, p_station, rid, rid || ' · AOG ' || p_aircraft || ' at ' || p_station || ' · reserved ' || it.id);
    return rid || ' raised. Reserved ' || it.id || ' at ' || from_st || ' and sent a transfer task to ' || from_st || ' stores.';
  end if;
  return rid || ' raised. Reserved ' || it.id || ' at ' || p_station || ' for issue.';
end $$;

-- Approvals. Value and AOG status are computed here, never trusted from the browser.
create or replace function public.approve_rec(p_rec text, p_pn text, p_station text, p_qty int) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); p parts; d rec_decisions; v numeric; lim numeric; is_aog boolean; high boolean; fin boolean := false;
        v_note text := ''; apprs jsonb; poid text; has_pl boolean; supname text;
begin
  if r.role not in ('planner', 'procurement') then raise exception 'Your role cannot approve reorders.'; end if;
  select * into p from parts where pn = p_pn;
  if p.pn is null then raise exception 'Unknown part number %.', p_pn; end if;
  if p_qty < 1 or p_qty > 200 then raise exception 'Quantity must be between 1 and 200.'; end if;
  v := p_qty * p.cost;
  select (value #>> '{}')::numeric into lim from settings where key = 'limit';
  is_aog := exists (select 1 from requests where pn = p_pn and station = p_station and status = 'Open' and priority = 'AOG');
  select * into d from rec_decisions where id = p_rec for update;
  if d.id is null then insert into rec_decisions(id, status) values (p_rec, 'Proposed') returning * into d; end if;
  if d.status not in ('Proposed', 'Awaiting second approval') then raise exception 'Already decided: %.', d.status; end if;
  if exists (select 1 from jsonb_array_elements(d.approvals) a where a->>'by' = r.id::text) then
    raise exception 'You already approved this. A second person must give the next approval.'; end if;
  if d.raised_by = r.id then raise exception 'You raised this order, so someone else must approve it.'; end if;
  high := v >= lim;
  has_pl := exists (select 1 from jsonb_array_elements(d.approvals) a join profiles pr on pr.id::text = a->>'by' where pr.role = 'planner');
  if is_aog then
    fin := true;
    if r.role = 'planner' and high then v_note := 'AOG fast path: Procurement Manager reviews within 24 h.'; end if;
  elsif not high then fin := true;
  elsif r.role = 'planner' then fin := jsonb_array_length(d.approvals) > 0;
  else
    if not has_pl then raise exception 'Orders at or above USD % need the Planner''s approval first.', to_char(lim, 'FM999,999,999'); end if;
    fin := true;
  end if;
  apprs := d.approvals || jsonb_build_array(jsonb_build_object('by', r.id, 'ts', now()));
  if not fin then
    update rec_decisions set approvals = apprs, status = 'Awaiting second approval', updated_at = now() where id = p_rec;
    perform _audit(r.id, 'Approved reorder (first level)', p_rec, 'USD ' || to_char(v, 'FM999,999,999'));
    return 'Approved. Waiting for the Procurement Manager.';
  end if;
  poid := 'PO-' || nextval('po_seq');
  insert into pos(id, sup, pn, qty, station, value, status, sent, approvals, aog, note)
  values (poid, p.sup, p_pn, p_qty, p_station, v, 'Sent', now(), apprs, is_aog, nullif(v_note, ''));
  update rec_decisions set approvals = apprs, status = 'Ordered', po = poid, note = nullif(v_note, ''), updated_at = now() where id = p_rec;
  select name into supname from suppliers where id = p.sup;
  perform _audit(r.id, 'Approved reorder', p_rec, poid || ' · USD ' || to_char(v, 'FM999,999,999'));
  return poid || ' sent to ' || supname || '.' || case when v_note <> '' then ' ' || v_note else '' end;
end $$;

create or replace function public.reject_rec(p_rec text) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me();
begin
  if r.role not in ('planner', 'procurement') then raise exception 'Your role cannot reject reorders.'; end if;
  insert into rec_decisions(id, status) values (p_rec, 'Rejected by ' || r.name)
  on conflict (id) do update set status = excluded.status, updated_at = now()
  where rec_decisions.status in ('Proposed', 'Awaiting second approval');
  perform _audit(r.id, 'Rejected reorder', p_rec, '');
  return 'Rejected. It stays in the decided list with your name on it.';
end $$;

create or replace function public.lateral_transfer(p_rec text, p_pn text, p_from text, p_to text, p_qty int) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); avail numeric; q int; rq text;
begin
  if r.role not in ('planner', 'procurement') then raise exception 'Your role cannot request transfers.'; end if;
  select coalesce(sum(qty), 0) into avail from items where pn = p_pn and loc = p_from and cond = 'serviceable' and reserved is null;
  if avail < 1 then raise exception 'No free serviceable stock at %.', p_from; end if;
  q := least(p_qty, avail::int);
  select id into rq from requests where pn = p_pn and station = p_to and status = 'Open' order by ts limit 1;
  insert into tasks(pn, qty, from_st, to_st, req, why) values (p_pn, q, p_from, p_to, rq, 'Lateral transfer instead of purchase · ' || p_rec);
  insert into rec_decisions(id, status, approvals) values (p_rec, 'Transfer requested from ' || p_from, jsonb_build_array(jsonb_build_object('by', r.id, 'ts', now())))
  on conflict (id) do update set status = excluded.status, approvals = excluded.approvals, updated_at = now();
  perform _audit(r.id, 'Requested lateral transfer', p_rec, p_from || ' → ' || p_to);
  return 'Transfer task sent to ' || p_from || ' stores. No purchase order raised.';
end $$;

create or replace function public.send_task(p_task bigint) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); t tasks; it items; trf text;
begin
  select * into t from tasks where id = p_task for update;
  if t.id is null or t.status <> 'Open' then raise exception 'That task is no longer open.'; end if;
  if r.role <> 'operator' or not (t.from_st = any (r.scope)) then raise exception 'Only stores at % can send this transfer.', t.from_st; end if;
  select * into it from items where pn = t.pn and loc = t.from_st and cond = 'serviceable' and transit is null
     and (reserved = t.req or reserved is null) order by (reserved = t.req) desc nulls last limit 1;
  if it.id is null then raise exception 'No serviceable unit left at %.', t.from_st; end if;
  trf := 'TRF-0' || nextval('trf_seq');
  perform _ingest(jsonb_build_object('type', 'TRANSFER_OUT', 'item', it.id, 'pn', t.pn, 'qty', least(t.qty, it.qty), 'from', t.from_st, 'to', t.to_st, 'trf', trf, 'reason', t.why), r.id, 'Scanner');
  update tasks set status = 'Sent' where id = p_task;
  perform _audit(r.id, 'Sent transfer', trf, it.id || ' ' || t.from_st || ' → ' || t.to_st);
  return trf || ': ' || it.id || ' on its way to ' || t.to_st || '.';
end $$;

create or replace function public.receive_po(p_po text) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); o pos; p parts; n int; i int; base int;
begin
  select * into o from pos where id = p_po for update;
  if o.id is null or o.status <> 'Shipped' then raise exception '% is not waiting for receipt.', p_po; end if;
  if r.role <> 'operator' or not (o.station = any (r.scope)) then raise exception 'Only stores at % can receive this delivery.', o.station; end if;
  select * into p from parts where pn = o.pn;
  if p.type = 'rotable' then
    select count(*) into n from events;
    base := 20000 + n;
    for i in 1..o.qty loop
      perform _ingest(jsonb_build_object('type', 'RECEIVE', 'item', p.prefix || '-' || (base + i), 'pn', p.pn, 'qty', 1, 'to', o.station, 'cond', 'pending', 'ref', o.id,
        'cert', case when o.cert_uploaded then 'Uploaded by supplier' else null end), r.id, 'Scanner');
    end loop;
  else
    perform _ingest(jsonb_build_object('type', 'RECEIVE', 'item', p.prefix || '-' || o.station || '-' || substr(o.id, 4), 'pn', p.pn, 'qty', o.qty, 'to', o.station,
      'cond', 'pending', 'ref', o.id, 'cert', case when o.cert_uploaded then 'Uploaded by supplier' else null end,
      'expiry', case when p.shelf is not null then now() + make_interval(days => p.shelf) else null end), r.id, 'Scanner');
  end if;
  update pos set status = 'Received', received = now() where id = p_po;
  perform _audit(r.id, 'Received delivery', p_po, o.qty || ' × ' || p.name || ' · pending inspection');
  return p_po || ' received. Parts wait in Pending inspection until Compliance verifies the certificate.';
end $$;

create or replace function public.issue_reserved(p_item text, p_req text) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); q requests; it items;
begin
  select * into q from requests where id = p_req for update;
  select * into it from items where id = p_item;
  if q.id is null or q.status <> 'Open' then raise exception 'Request % is not open.', p_req; end if;
  if r.role <> 'operator' or not (it.loc = any (r.scope)) then raise exception 'Only stores at % can issue this part.', coalesce(it.loc, 'its station'); end if;
  perform _ingest(jsonb_build_object('type', 'ISSUE', 'item', it.id, 'pn', it.pn, 'qty', q.qty, 'from', it.loc, 'ref', q.id, 'aircraft', q.aircraft), r.id, 'Scanner');
  update requests set status = 'Issued' where id = p_req;
  perform _audit(r.id, 'Issued part', it.id, q.id || ' · ' || q.aircraft);
  return it.id || ' issued to ' || q.aircraft || ' against ' || coalesce(q.wo, q.id) || '.';
end $$;

create or replace function public.supplier_po(p_po text, p_action text) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); o pos; p parts;
begin
  select * into o from pos where id = p_po for update;
  if r.role <> 'supplier' or o.id is null or o.sup is distinct from r.supplier then raise exception 'You can act only on your own orders.'; end if;
  select * into p from parts where pn = o.pn;
  if p_action = 'accept' and o.status = 'Sent' then
    update pos set status = 'Confirmed', promised = now() + make_interval(days => p.lead) where id = p_po;
  elsif p_action = 'decline' and o.status = 'Sent' then update pos set status = 'Rejected' where id = p_po;
  elsif p_action = 'cert' and o.status = 'Confirmed' then update pos set cert_uploaded = true where id = p_po;
  elsif p_action = 'ship' and o.status = 'Confirmed' then
    update pos set status = 'Shipped', shipped = now(), tracking = 'AWB 176-' || (40000000 + floor(random() * 9999999)::int) where id = p_po;
  else raise exception 'That action is not possible while the order is %.', o.status; end if;
  perform _audit(r.id, 'Supplier ' || p_action, p_po, '');
  return case p_action when 'accept' then p_po || ' confirmed.' when 'decline' then p_po || ' declined. The planner can reorder elsewhere.'
    when 'cert' then 'Certificate uploaded. Compliance verifies it on receipt.' else p_po || ' shipped.' end;
end $$;

create or replace function public.propose_limit(p_value numeric) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); cur numeric;
begin
  if r.role <> 'admin' then raise exception 'Only the Admin can propose a new approval limit.'; end if;
  select (value #>> '{}')::numeric into cur from settings where key = 'limit';
  if p_value is null or p_value < 500 or p_value = cur then raise exception 'Enter a different limit of at least USD 500.'; end if;
  insert into settings(key, value) values ('pending_limit', jsonb_build_object('value', p_value, 'by', r.id))
  on conflict (key) do update set value = excluded.value;
  perform _audit(r.id, 'Proposed approval limit', 'Approval limit', 'USD ' || cur || ' → USD ' || p_value);
  return 'Proposed. The Procurement Manager must approve it.';
end $$;

create or replace function public.decide_limit(p_ok boolean) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); pend jsonb;
begin
  if r.role <> 'procurement' then raise exception 'Only the Procurement Manager can decide limit changes.'; end if;
  select value into pend from settings where key = 'pending_limit';
  if pend is null then raise exception 'No change is waiting.'; end if;
  if p_ok then update settings set value = pend->'value' where key = 'limit'; end if;
  delete from settings where key = 'pending_limit';
  perform _audit(r.id, case when p_ok then 'Approved approval limit' else 'Rejected approval limit change' end, 'Approval limit', 'USD ' || (pend->>'value'));
  return case when p_ok then 'Approval limit is now USD ' || (pend->>'value') || '.' else 'Change rejected.' end;
end $$;
