-- Brings the system in line with the scope in Chapters 1-2:
--   eight roles; repair send and return events; RFID gate reads; ERP stock import for reconciliation;
--   supplier notifications with acknowledgement and promised date; and an H1 visibility probe.

-- 1. Eight user roles. The management viewer is not one of them.
delete from auth.users where id in (select id from public.profiles where role = 'viewer');
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('superadmin','admin','operator','technician','planner','procurement','compliance','supplier'));

-- 2. Repair loop: serialised rotables go to the repair vendor and come back for inspection.
alter table public.events drop constraint events_type_check;
alter table public.events add constraint events_type_check check (type in
  ('RECEIVE','VERIFY','CONDITION','TRANSFER_OUT','TRANSFER_IN','ISSUE','RESERVE','RELEASE','TURN_IN','ADJUST','SCRAP','REPAIR_OUT','REPAIR_IN'));
alter table public.items add column if not exists repair jsonb;
create sequence if not exists public.ro_seq start 1201;

create or replace function public.apply_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare it public.items; ptype text;
begin
  case new.type
  when 'RECEIVE', 'TURN_IN' then
    insert into items(id, pn, qty, loc, cond, ref, expiry, cert, since)
    values (new.item, new.pn, new.qty, new.to_st, coalesce(new.cond, 'pending'), new.ref, new.expiry, new.cert, new.ts);
  when 'VERIFY' then update items set cond = 'serviceable', cert = new.cert where id = new.item;
  when 'CONDITION' then update items set cond = new.cond where id = new.item;
  when 'TRANSFER_OUT' then
    select * into it from items where id = new.item;
    if new.qty >= it.qty then
      update items set loc = null, transit = jsonb_build_object('trf', new.trf, 'from', new.from_st, 'to', new.to_st, 'ts', new.ts) where id = new.item;
    else
      update items set qty = qty - new.qty where id = new.item;
      insert into items(id, pn, qty, loc, cond, transit, reserved, expiry, cert, ref, since, parent)
      values (it.id || '/' || new.trf, it.pn, new.qty, null, it.cond,
              jsonb_build_object('trf', new.trf, 'from', new.from_st, 'to', new.to_st, 'ts', new.ts),
              null, it.expiry, it.cert, it.ref, it.since, it.id);
    end if;
  when 'TRANSFER_IN' then update items set loc = transit->>'to', transit = null, since = new.ts where transit->>'trf' = new.trf;
  when 'ISSUE' then
    select type into ptype from parts where pn = new.pn;
    if ptype = 'rotable' then update items set loc = null, cond = 'issued', on_aircraft = new.aircraft, reserved = null where id = new.item;
    else update items set qty = qty - new.qty, reserved = case when qty - new.qty <= 0 then null else reserved end where id = new.item;
    end if;
  when 'RESERVE' then update items set reserved = new.ref where id = new.item;
  when 'RELEASE' then update items set reserved = null where id = new.item;
  when 'ADJUST' then update items set qty = qty + new.qty where id = new.item;
  when 'SCRAP' then update items set cond = 'scrapped', loc = null where id = new.item;
  when 'REPAIR_OUT' then
    update items set loc = null, cond = 'in repair', reserved = null,
      repair = jsonb_build_object('ro', new.ref, 'vendor', new.reason, 'from', new.from_st, 'ts', new.ts) where id = new.item;
  when 'REPAIR_IN' then
    update items set loc = new.to_st, cond = 'pending', repair = null, cert = new.cert, since = new.ts where id = new.item;
  else null;
  end case;
  return new;
end $$;

create or replace function public._ingest(e jsonb, p_actor uuid, p_source text default 'Avilo') returns bigint
language plpgsql security definer set search_path = public as $$
declare t text := e->>'type'; it items; p parts; q numeric := coalesce((e->>'qty')::numeric, 1); new_id bigint;
        v_trf text := e->>'trf'; v_ref text := e->>'ref'; v_reason text := e->>'reason';
begin
  select * into p from parts where pn = e->>'pn';
  if p.pn is null then raise exception 'Unknown part number %.', e->>'pn'; end if;
  if t not in ('RECEIVE', 'TURN_IN', 'TRANSFER_IN') then
    select * into it from items where id = e->>'item';
    if it.id is null then raise exception 'No stock record for %.', e->>'item'; end if;
  end if;
  if q <= 0 then raise exception 'Quantity must be more than zero.'; end if;
  if t = 'ISSUE' then
    if it.cond <> 'serviceable' then raise exception '% is % and cannot be issued.', it.id, it.cond; end if;
    if it.loc is distinct from e->>'from' then raise exception '% is not at %.', it.id, e->>'from'; end if;
    if q > it.qty then raise exception 'Only % % left in %.', it.qty, p.unit, it.id; end if;
    if it.reserved is not null and it.reserved is distinct from e->>'ref' then raise exception '% is reserved for %.', it.id, it.reserved; end if;
  elsif t = 'TRANSFER_OUT' then
    if it.transit is not null then raise exception '% is already in transit.', it.id; end if;
    if it.cond in ('issued', 'scrapped', 'pending', 'in repair') then raise exception '% cannot be transferred while %.', it.id, it.cond; end if;
    if it.loc is distinct from e->>'from' then raise exception '% is not at %.', it.id, e->>'from'; end if;
    if e->>'to' is null or e->>'to' = e->>'from' then raise exception 'Choose a different destination station.'; end if;
    if q > it.qty then raise exception 'Only % available.', it.qty; end if;
    if v_trf is null then v_trf := 'TRF-0' || nextval('trf_seq'); end if;
  elsif t in ('RECEIVE', 'TURN_IN') then
    if coalesce(e->>'item', '') = '' then raise exception 'Enter a serial or batch number.'; end if;
    if exists (select 1 from items where id = e->>'item') then raise exception '% already exists in the ledger.', e->>'item'; end if;
  elsif t = 'TRANSFER_IN' then
    if not exists (select 1 from items where transit->>'trf' = v_trf) then raise exception 'Transfer % is not in transit.', v_trf; end if;
  elsif t = 'VERIFY' then
    if it.cond <> 'pending' then raise exception '% is not waiting for inspection.', it.id; end if;
  elsif t = 'REPAIR_OUT' then
    if p.type <> 'rotable' then raise exception 'Only serialised rotables go to repair.'; end if;
    if it.cond not in ('unserviceable', 'repairable') then raise exception '% is % and does not need repair.', it.id, it.cond; end if;
    if it.loc is distinct from e->>'from' then raise exception '% is not at %.', it.id, e->>'from'; end if;
    if it.transit is not null then raise exception '% is in transit.', it.id; end if;
    q := 1;
    v_ref := 'RO-' || nextval('ro_seq');
    v_reason := coalesce(nullif(v_reason, ''), (select name from suppliers where id = p.sup));
  elsif t = 'REPAIR_IN' then
    if it.cond <> 'in repair' then raise exception '% is not out for repair.', it.id; end if;
    if coalesce(e->>'to', '') = '' then raise exception 'Choose the receiving station.'; end if;
    q := 1;
    v_ref := coalesce(v_ref, it.repair->>'ro');
  end if;
  insert into events(type, item, pn, qty, from_st, to_st, trf, ref, aircraft, cond, cert, reason, expiry, actor, source)
  values (t, e->>'item', p.pn, q, e->>'from', e->>'to', v_trf, v_ref, e->>'aircraft', e->>'cond', e->>'cert', v_reason,
          (e->>'expiry')::timestamptz, p_actor, p_source)
  returning id into new_id;
  return new_id;
end $$;
revoke execute on function public._ingest(jsonb, uuid, text) from public, anon, authenticated;

create or replace function public.ingest(e jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); t text := e->>'type'; st text; recv uuid; new_id bigint;
begin
  if t in ('RECEIVE', 'TURN_IN', 'TRANSFER_IN', 'TRANSFER_OUT', 'ISSUE', 'REPAIR_OUT', 'REPAIR_IN') then
    if r.role <> 'operator' then raise exception 'Only stores operators record stock movements.'; end if;
    st := case when t in ('TRANSFER_OUT', 'ISSUE', 'REPAIR_OUT') then e->>'from' else e->>'to' end;
    if t = 'TRANSFER_IN' then select transit->>'to' into st from items where transit->>'trf' = e->>'trf' limit 1; end if;
    if st is null or not (st = any (r.scope)) then raise exception 'Your location scope does not include %.', coalesce(st, 'that station'); end if;
  elsif t in ('VERIFY', 'CONDITION', 'SCRAP') then
    if r.role <> 'compliance' then raise exception 'Only the Compliance Officer can change part condition.'; end if;
    if t = 'VERIFY' then
      select actor into recv from events where item = e->>'item' and type in ('RECEIVE', 'REPAIR_IN') order by id desc limit 1;
      if recv = r.id then raise exception 'You received this part, so another inspector must verify it.'; end if;
    end if;
    if t = 'CONDITION' and coalesce(e->>'reason', '') = '' then raise exception 'Give a reason for the condition change.'; end if;
  else
    raise exception 'Event type % cannot be posted directly.', t;
  end if;
  new_id := _ingest(e, r.id, 'Avilo');
  perform _audit(r.id, case t when 'RECEIVE' then 'Received part' when 'TURN_IN' then 'Turned in part' when 'TRANSFER_IN' then 'Confirmed transfer receipt'
    when 'TRANSFER_OUT' then 'Sent transfer' when 'ISSUE' then 'Issued part' when 'VERIFY' then 'Verified certificate'
    when 'CONDITION' then 'Changed condition' when 'REPAIR_OUT' then 'Sent for repair' when 'REPAIR_IN' then 'Received from repair' else 'Scrapped part' end,
    coalesce(e->>'item', e->>'trf'), concat_ws(' · ', e->>'from', e->>'to', e->>'cond', e->>'reason', (select ref from events where id = new_id and type like 'REPAIR%')));
  return new_id;
end $$;

-- 3. RFID gate readers at each store's dock. A read is checked against the ledger: an expected
--    arrival confirms the transfer; anything the ledger does not expect raises an exception.
create table if not exists public.readers (id text primary key, station text not null, direction text not null check (direction in ('in', 'out')), label text not null);
insert into public.readers(id, station, direction, label) values
  ('LHR-DOCK-IN', 'LHR', 'in', 'LHR goods-in gate'), ('LHR-DOCK-OUT', 'LHR', 'out', 'LHR goods-out gate'),
  ('SIN-DOCK-IN', 'SIN', 'in', 'SIN goods-in gate'), ('SIN-DOCK-OUT', 'SIN', 'out', 'SIN goods-out gate'),
  ('LOS-DOCK-IN', 'LOS', 'in', 'LOS goods-in gate'), ('LOS-DOCK-OUT', 'LOS', 'out', 'LOS goods-out gate'),
  ('DXB-DOCK-IN', 'DXB', 'in', 'DXB goods-in gate'), ('DXB-DOCK-OUT', 'DXB', 'out', 'DXB goods-out gate')
on conflict (id) do nothing;

create table if not exists public.sensor_reads (
  id bigserial primary key, ts timestamptz not null default now(), reader text not null references public.readers(id),
  item text not null, result text not null, event_id bigint
);
create table if not exists public.exceptions (
  id bigserial primary key, ts timestamptz not null default now(), kind text not null, object text, station text,
  detail text, status text not null default 'Open', resolved_by uuid references public.profiles(id), resolved_at timestamptz, note text
);

create or replace function public._gate(p_reader text, p_item text) returns text
language plpgsql security definer set search_path = public as $$
declare rd readers; it items; res text; ev bigint;
begin
  select * into rd from readers where id = p_reader;
  if rd.id is null then raise exception 'Unknown reader %.', p_reader; end if;
  select * into it from items where id = p_item;
  if it.id is null then
    res := 'Unknown tag';
    insert into exceptions(kind, object, station, detail) values ('Unknown tag', p_item, rd.station, rd.label || ' read a tag the ledger does not know.');
  elsif rd.direction = 'in' then
    if it.transit is not null and it.transit->>'to' = rd.station then
      ev := _ingest(jsonb_build_object('type', 'TRANSFER_IN', 'trf', it.transit->>'trf', 'pn', it.pn), null, 'RFID ' || rd.id);
      res := 'Receipt confirmed · ' || (it.transit->>'trf');
    elsif it.loc = rd.station then res := 'Already recorded here';
    else
      res := 'Unexpected arrival';
      insert into exceptions(kind, object, station, detail) values ('Unexpected arrival', it.id, rd.station,
        it.id || ' arrived at ' || rd.station || ' but the ledger has it ' || coalesce('at ' || it.loc, 'in transit to ' || (it.transit->>'to'), 'off the shelf (' || it.cond || ')') || '.');
    end if;
  else
    if it.transit is not null and it.transit->>'from' = rd.station then res := 'Departure confirmed · ' || (it.transit->>'trf');
    elsif it.loc = rd.station then
      res := 'Left without a transfer';
      insert into exceptions(kind, object, station, detail) values ('Left without a transfer', it.id, rd.station,
        it.id || ' passed the ' || rd.station || ' goods-out gate with no transfer, issue or repair order recorded.');
    else res := 'Not expected here';
      insert into exceptions(kind, object, station, detail) values ('Unexpected departure', it.id, rd.station, it.id || ' read leaving ' || rd.station || ' but the ledger does not have it there.');
    end if;
  end if;
  insert into sensor_reads(reader, item, result, event_id) values (p_reader, p_item, res, ev);
  return rd.label || ': ' || res || '.';
end $$;
revoke execute on function public._gate(text, text) from public, anon, authenticated;

-- The reader is a device. A person can stand in for one only at their own station (or Avilo Support, for testing).
create or replace function public.gate_read(p_reader text, p_item text) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); st text;
begin
  select station into st from readers where id = p_reader;
  if st is null then raise exception 'Unknown reader %.', p_reader; end if;
  if not (r.role = 'superadmin' or (r.role = 'operator' and st = any (r.scope))) then raise exception 'Only stores at % can feed this gate.', st; end if;
  return _gate(p_reader, p_item);
end $$;

create or replace function public.resolve_exception(p_id bigint, p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); x exceptions;
begin
  select * into x from exceptions where id = p_id for update;
  if x.id is null or x.status <> 'Open' then raise exception 'That exception is not open.'; end if;
  if not (r.role in ('planner', 'compliance') or (r.role = 'operator' and x.station = any (r.scope))) then raise exception 'Your role cannot close this exception.'; end if;
  if coalesce(p_note, '') = '' then raise exception 'Say what you found.'; end if;
  update exceptions set status = 'Resolved', resolved_by = r.id, resolved_at = now(), note = p_note where id = p_id;
  perform _audit(r.id, 'Resolved exception', x.kind || ' · ' || coalesce(x.object, ''), p_note);
  return 'Exception closed.';
end $$;

-- 4. ERP import: stock-on-hand extracts (e.g. Navision / Business Central "Item Ledger" by location)
--    are stored as they were sent, so the ledger can be reconciled against them line by line.
create table if not exists public.erp_batches (
  id bigserial primary key, ts timestamptz not null default now(), by_user uuid references public.profiles(id),
  filename text, system text, rows int not null default 0, rejected jsonb not null default '[]'
);
create table if not exists public.erp_records (
  batch bigint not null references public.erp_batches(id) on delete cascade, pn text not null references public.parts(pn),
  station text not null, qty numeric not null, bin text
);

create or replace function public.import_erp(p_filename text, p_system text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); b bigint; x jsonb; ok int := 0; bad jsonb := '[]'; n int := 0;
begin
  if r.role not in ('planner', 'admin', 'superadmin') then raise exception 'Only the Planner or an Admin can import ERP records.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'The file has no rows.'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'At most 5,000 rows per import.'; end if;
  insert into erp_batches(by_user, filename, system) values (r.id, left(p_filename, 120), left(coalesce(p_system, 'ERP'), 40)) returning id into b;
  for x in select value from jsonb_array_elements(p_rows) loop
    n := n + 1;
    if not exists (select 1 from parts where pn = x->>'pn') then bad := bad || jsonb_build_object('line', n, 'reason', 'Unknown part number ' || coalesce(x->>'pn', '(blank)'));
    elsif coalesce(x->>'station', '') not in ('LHR', 'SIN', 'LOS', 'DXB') then bad := bad || jsonb_build_object('line', n, 'reason', 'Unknown location ' || coalesce(x->>'station', '(blank)'));
    elsif (x->>'qty') !~ '^-?[0-9]+(\.[0-9]+)?$' then bad := bad || jsonb_build_object('line', n, 'reason', 'Quantity is not a number');
    else insert into erp_records(batch, pn, station, qty, bin) values (b, x->>'pn', x->>'station', (x->>'qty')::numeric, left(x->>'bin', 40)); ok := ok + 1;
    end if;
  end loop;
  update erp_batches set rows = ok, rejected = bad where id = b;
  perform _audit(r.id, 'Imported ERP records', 'ERP-' || b, ok || ' rows from ' || coalesce(p_filename, 'file') || case when jsonb_array_length(bad) > 0 then ' · ' || jsonb_array_length(bad) || ' rejected' else '' end);
  return jsonb_build_object('batch', b, 'accepted', ok, 'rejected', bad);
end $$;

-- 5. Supplier collaboration: notifications, acknowledgement and promised date.
alter table public.pos add column if not exists acknowledged timestamptz;
create table if not exists public.notifications (
  id bigserial primary key, ts timestamptz not null default now(), to_role text, to_supplier text, station text,
  kind text not null, object text, body text not null
);
create table if not exists public.notification_reads (notification bigint references public.notifications(id) on delete cascade, by_user uuid references public.profiles(id) on delete cascade, primary key (notification, by_user));

create or replace function public.notify_po() returns trigger
language plpgsql security definer set search_path = public as $$
declare pn_name text; sname text;
begin
  select name into pn_name from parts where pn = new.pn;
  select name into sname from suppliers where id = new.sup;
  if tg_op = 'INSERT' then
    insert into notifications(to_supplier, kind, object, body) values (new.sup, 'New order', new.id,
      'New purchase order ' || new.id || ': ' || new.qty || ' × ' || pn_name || ' for ' || new.station || case when new.aog then ' · AOG, ship today' else '' end || '. Please confirm and give a delivery date.');
  elsif new.status is distinct from old.status then
    if new.status = 'Confirmed' then
      insert into notifications(to_role, kind, object, body) select x, 'Order confirmed', new.id, sname || ' confirmed ' || new.id || ', promised ' || to_char(new.promised, 'DD Mon YYYY') || '.' from unnest(array['planner', 'procurement']) x;
    elsif new.status = 'Rejected' then
      insert into notifications(to_role, kind, object, body) select x, 'Order declined', new.id, sname || ' declined ' || new.id || '. Reorder from another source.' from unnest(array['planner', 'procurement']) x;
    elsif new.status = 'Shipped' then
      insert into notifications(to_role, station, kind, object, body) values ('operator', new.station, 'Shipment on its way', new.id, new.id || ' shipped by ' || sname || ' to ' || new.station || ' · ' || coalesce(new.tracking, '') || '.');
    elsif new.status = 'Received' then
      insert into notifications(to_role, kind, object, body) values ('compliance', 'Waiting for inspection', new.id, new.id || ' received at ' || new.station || '. Verify the certificate.');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists pos_notify on public.pos;
create trigger pos_notify after insert or update on public.pos for each row execute function public.notify_po();

create or replace function public.supplier_po(p_po text, p_action text, p_promised date default null) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); o pos; p parts; prom timestamptz;
begin
  select * into o from pos where id = p_po for update;
  if r.role <> 'supplier' or o.id is null or o.sup is distinct from r.supplier then raise exception 'You can act only on your own orders.'; end if;
  select * into p from parts where pn = o.pn;
  if p_action = 'accept' and o.status = 'Sent' then
    prom := coalesce(p_promised::timestamptz + interval '12 hours', now() + make_interval(days => p.lead));
    if prom < now() then raise exception 'The promised date cannot be in the past.'; end if;
    update pos set status = 'Confirmed', acknowledged = now(), promised = prom where id = p_po;
  elsif p_action = 'decline' and o.status = 'Sent' then update pos set status = 'Rejected', acknowledged = now() where id = p_po;
  elsif p_action = 'cert' and o.status = 'Confirmed' then update pos set cert_uploaded = true where id = p_po;
  elsif p_action = 'ship' and o.status = 'Confirmed' then
    update pos set status = 'Shipped', shipped = now(), tracking = 'AWB 176-' || (40000000 + floor(random() * 9999999)::int) where id = p_po;
  else raise exception 'That action is not possible while the order is %.', o.status; end if;
  perform _audit(r.id, 'Supplier ' || p_action, p_po, case when p_action = 'accept' then 'Promised ' || to_char(prom, 'DD Mon YYYY') else '' end);
  return case p_action when 'accept' then p_po || ' confirmed for ' || to_char(prom, 'DD Mon YYYY') || '.' when 'decline' then p_po || ' declined. The planner can reorder elsewhere.'
    when 'cert' then 'Certificate uploaded. Compliance verifies it on receipt.' else p_po || ' shipped.' end;
end $$;
drop function if exists public.supplier_po(text, text);

create or replace function public.mark_read(p_ids bigint[]) returns void
language plpgsql security definer set search_path = public as $$
declare r profiles := _me();
begin
  insert into notification_reads(notification, by_user) select unnest(p_ids), r.id on conflict do nothing;
end $$;

-- 6. H1 visibility test. A probe posts small, self-cancelling movements on a dedicated test item so the
--    client can time how long a ledger change takes to appear on screen; seed_h1 plants known
--    discrepancies (lost transfers, ERP mismatches, gate exceptions) whose detection is then scored.
create or replace function public.h1_probe(p_seq int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); ev bigint;
begin
  if r.role not in ('superadmin', 'admin') then raise exception 'Only Avilo Support or an Admin can run the visibility test.'; end if;
  if not exists (select 1 from items where id = 'H1-PROBE') then
    insert into events(type, item, pn, qty, to_st, cond, ref, cert, actor, source)
    values ('RECEIVE', 'H1-PROBE', 'RL-7700-2', 1, 'LHR', 'quarantined', 'H1-TEST', 'Test item: never issued', r.id, 'H1 probe');
  end if;
  insert into events(type, item, pn, qty, reason, actor, source)
  values ('ADJUST', 'H1-PROBE', 'RL-7700-2', case when p_seq % 2 = 0 then 1 else -1 end, 'H1 latency probe #' || p_seq, r.id, 'H1 probe')
  returning id into ev;
  return jsonb_build_object('id', ev, 'ts', now());
end $$;

create or replace function public.seed_h1() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); i int; b bigint; lost jsonb := '[]'; ok jsonb := '[]'; erp jsonb := '[]'; gates jsonb := '[]'; x record; tag text; trf text;
  pns text[] := array['OF-1290-8','OK-29-104','HF-500B-GL','RL-7700-2','LL-4596-1']; sts text[] := array['LHR','SIN','LOS','DXB'];
begin
  if r.role not in ('superadmin', 'admin') then raise exception 'Only Avilo Support or an Admin can seed the visibility test.'; end if;
  if exists (select 1 from items where id like 'H1-T%') then raise exception 'Test data is already seeded. Reset the demo data first.'; end if;
  -- 10 transfers that will never be received (sent 80 h ago) and 10 normal ones (sent 10 h ago)
  for i in 1..20 loop
    tag := 'H1-T' || lpad(i::text, 2, '0'); trf := 'TRF-H1' || lpad(i::text, 2, '0');
    insert into events(ts, type, item, pn, qty, to_st, cond, cert, ref, actor, source) values (now() - interval '200 hours', 'RECEIVE', tag, pns[1 + i % 5], 1, sts[1 + i % 4], 'serviceable', 'H1 test', 'H1-TEST', r.id, 'H1 test');
    insert into events(ts, type, item, pn, qty, from_st, to_st, trf, ref, actor, source) values (now() - case when i <= 10 then interval '80 hours' else interval '10 hours' end, 'TRANSFER_OUT', tag, pns[1 + i % 5], 1, sts[1 + i % 4], sts[1 + (i + 1) % 4], trf, 'H1-TEST', r.id, 'H1 test');
    if i <= 10 then lost := lost || to_jsonb(trf); else ok := ok || to_jsonb(trf); end if;
  end loop;
  -- an ERP extract that matches the ledger except for 10 known lines
  insert into erp_batches(by_user, filename, system) values (r.id, 'H1 seeded extract', 'H1 test') returning id into b;
  i := 0;
  for x in select pn, loc, sum(qty) q from items where loc is not null and cond in ('serviceable', 'pending') and id not like 'H1-%' group by pn, loc order by pn, loc loop
    i := i + 1;
    if i % 6 = 0 and jsonb_array_length(erp) < 10 then
      insert into erp_records(batch, pn, station, qty) values (b, x.pn, x.loc, x.q + 1 + (i % 3));
      erp := erp || jsonb_build_object('pn', x.pn, 'station', x.loc);
    else insert into erp_records(batch, pn, station, qty) values (b, x.pn, x.loc, x.q);
    end if;
  end loop;
  update erp_batches set rows = (select count(*) from erp_records where batch = b) where id = b;
  -- 5 gate reads of stock leaving with no transfer recorded
  for x in select id, loc from items where loc is not null and cond = 'serviceable' and id not like 'H1-%' and transit is null order by id limit 5 loop
    perform _gate(x.loc || '-DOCK-OUT', x.id);
    gates := gates || to_jsonb(x.id);
  end loop;
  perform _audit(r.id, 'Seeded visibility test', 'H1', '10 lost transfers, 10 normal transfers, 10 ERP mismatches, 5 gate exceptions');
  return jsonb_build_object('lost', lost, 'normal', ok, 'erp', erp, 'erpBatch', b, 'gates', gates);
end $$;

-- 7. Reads, grants, realtime.
create or replace function public.my_scope() returns text[] language sql stable security definer set search_path = public as
$$ select coalesce(scope, '{}') from profiles where id = auth.uid() $$;

alter table public.readers enable row level security;
alter table public.sensor_reads enable row level security;
alter table public.exceptions enable row level security;
alter table public.erp_batches enable row level security;
alter table public.erp_records enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;
create policy "read readers" on public.readers for select to authenticated using (true);
create policy "staff read sensor reads" on public.sensor_reads for select to authenticated using (public.my_role() <> 'supplier');
create policy "staff read exceptions" on public.exceptions for select to authenticated using (public.my_role() <> 'supplier');
create policy "staff read erp batches" on public.erp_batches for select to authenticated using (public.my_role() <> 'supplier');
create policy "staff read erp records" on public.erp_records for select to authenticated using (public.my_role() <> 'supplier');
create policy "own notifications" on public.notifications for select to authenticated
  using ((to_supplier is not null and to_supplier = public.my_supplier())
      or (to_role is not null and to_role = public.my_role() and (station is null or station = any (public.my_scope()))));
create policy "own reads" on public.notification_reads for select to authenticated using (by_user = auth.uid());
revoke insert, update, delete, truncate on public.readers, public.sensor_reads, public.exceptions, public.erp_batches, public.erp_records, public.notifications, public.notification_reads from anon, authenticated;
revoke all on public.readers, public.sensor_reads, public.exceptions, public.erp_batches, public.erp_records, public.notifications, public.notification_reads from anon;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.my_role(), public.my_supplier(), public.my_scope() to authenticated;
grant execute on function public.ingest(jsonb), public.scanner_tick(), public.raise_request(text, text, text, text, text),
  public.approve_rec(text, text, text, int), public.reject_rec(text), public.lateral_transfer(text, text, text, text, int),
  public.send_task(bigint), public.receive_po(text), public.issue_reserved(text, text), public.supplier_po(text, text, date),
  public.propose_limit(numeric), public.decide_limit(boolean), public.reset_demo(),
  public.gate_read(text, text), public.resolve_exception(bigint, text), public.import_erp(text, text, jsonb), public.mark_read(bigint[]),
  public.h1_probe(int), public.seed_h1() to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter publication supabase_realtime add table public.exceptions, public.notifications, public.erp_batches, public.sensor_reads;
