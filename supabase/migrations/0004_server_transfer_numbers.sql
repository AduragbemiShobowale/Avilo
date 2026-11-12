-- Manual transfers get their number from the database sequence, and a few extra input checks.
create or replace function public._ingest(e jsonb, p_actor uuid, p_source text default 'Avilo') returns bigint
language plpgsql security definer set search_path = public as $$
declare t text := e->>'type'; it items; p parts; q numeric := coalesce((e->>'qty')::numeric, 1); new_id bigint; v_trf text := e->>'trf';
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
    if it.cond in ('issued', 'scrapped', 'pending') then raise exception '% cannot be transferred while %.', it.id, it.cond; end if;
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
  end if;
  insert into events(type, item, pn, qty, from_st, to_st, trf, ref, aircraft, cond, cert, reason, expiry, actor, source)
  values (t, e->>'item', p.pn, q, e->>'from', e->>'to', v_trf, e->>'ref', e->>'aircraft', e->>'cond', e->>'cert', e->>'reason',
          (e->>'expiry')::timestamptz, p_actor, p_source)
  returning id into new_id;
  return new_id;
end $$;

revoke execute on function public._ingest(jsonb, uuid, text) from public, anon, authenticated;
