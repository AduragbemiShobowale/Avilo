-- Demo data for the features added in 0005, and a reset that clears them.

create or replace function public.seed_extras() returns void
language plpgsql security definer set search_path = public as $$
declare pl uuid := (select id from profiles where handle = 'u-pl');
        op1 uuid := (select id from profiles where handle = 'u-op1');
        op2 uuid := (select id from profiles where handle = 'u-op2');
        co uuid := (select id from profiles where handle = 'u-co');
        x jsonb; pt parts; n int; k int;
begin
  -- Opening balances for the framework's reorder points (supplier lead times as observed), so a fresh
  -- demo starts with a handful of real recommendations rather than one for every part.
  n := 11500;
  for x in select value from jsonb_array_elements('[["3214552-3", "SIN", 3], ["3505986-12", "SIN", 1], ["3505986-12", "DXB", 2], ["2C1185-04", "LHR", 1], ["5009873-7", "LHR", 2], ["5009873-7", "SIN", 1], ["5009873-7", "LOS", 1], ["5009873-7", "DXB", 2], ["AD-822410", "LOS", 2], ["AD-822410", "DXB", 1], ["3800706-2", "LHR", 1], ["3800706-2", "LOS", 2], ["VT-622-0450", "LHR", 2], ["VT-622-0450", "LOS", 1], ["3291460-5", "LHR", 1], ["3291460-5", "SIN", 1], ["TY-H44-5", "LHR", 6], ["OF-1290-8", "LOS", 5], ["OF-1290-8", "DXB", 2], ["OK-29-104", "LOS", 4], ["WB-5520-3", "SIN", 3]]'::jsonb) loop
    select * into pt from parts where pn = x->>0;
    if pt.type = 'rotable' then
      for k in 1..(x->>2)::int loop
        n := n + 1;
        insert into events(ts, type, item, pn, qty, to_st, cond, cert, ref, actor, source)
          values (now() - interval '60 days', 'RECEIVE', pt.prefix || '-' || n, pt.pn, 1, x->>1, 'serviceable', 'EASA Form 1', 'Opening balance', null, 'ERP extract');
      end loop;
    else
      insert into events(ts, type, item, pn, qty, to_st, cond, cert, ref, expiry, actor, source)
        values (now() - interval '60 days', 'RECEIVE', pt.prefix || '-' || (x->>1) || '-OB', pt.pn, (x->>2)::int, x->>1, 'serviceable', 'CoC', 'Opening balance',
                case when pt.shelf is not null then now() + make_interval(days => pt.shelf - 60) end, null, 'ERP extract');
    end if;
  end loop;

  -- Supplier acknowledgement times for the order history (1 to 3 days after the order was sent).
  update pos set acknowledged = sent + make_interval(hours => 18 + (substr(id, 4)::int % 5) * 12)
   where acknowledged is null and status in ('Confirmed', 'Shipped', 'Received');

  -- Repair loop: two completed repair cycles and one unit still at the vendor.
  for x in select value from jsonb_array_elements('[
    ["PV-10388", "3291460-5", "LHR", "Kestrel Rotables", -96, -94, -66, -65],
    ["ST-10391", "3505986-12", "SIN", "Halcyon Aero Spares", -80, -78, -45, -44],
    ["NW-10433", "NW-277104", "LHR", "Kestrel Rotables", -21, -19, null, null]]'::jsonb) loop
    insert into events(ts, type, item, pn, qty, to_st, cond, ref, actor, source)
      values (now() + make_interval(days => (x->>4)::int), 'TURN_IN', x->>0, x->>1, 1, x->>2, 'unserviceable', 'Removed at line check', op1, 'Avilo');
    insert into events(ts, type, item, pn, qty, from_st, ref, reason, actor, source)
      values (now() + make_interval(days => (x->>5)::int), 'REPAIR_OUT', x->>0, x->>1, 1, x->>2, 'RO-' || nextval('ro_seq'), x->>3, op1, 'Avilo');
    if x->>6 is not null then
      insert into events(ts, type, item, pn, qty, to_st, ref, cert, actor, source)
        values (now() + make_interval(days => (x->>6)::int), 'REPAIR_IN', x->>0, x->>1, 1, x->>2,
                (select ref from events where item = x->>0 and type = 'REPAIR_OUT' order by id desc limit 1), 'EASA Form 1 (repair)', op2, 'Avilo');
      insert into events(ts, type, item, pn, cert, actor, source)
        values (now() + make_interval(days => (x->>7)::int), 'VERIFY', x->>0, x->>1, 'EASA Form 1 (repair)', co, 'Avilo');
    end if;
  end loop;

  -- Gate reads: one confirmed departure and one exception for the Control tower.
  insert into sensor_reads(ts, reader, item, result) values (now() - interval '50 hours', 'LHR-DOCK-OUT', 'NW-10433', 'Repair dispatch');
  insert into exceptions(ts, kind, object, station, detail)
    select now() - interval '6 hours', 'Left without a transfer', id, 'DXB', id || ' passed the DXB goods-out gate with no transfer, issue or repair order recorded.'
      from items where loc = 'DXB' and pn = 'OF-1290-8' and cond = 'serviceable' order by id limit 1;

  -- Notifications: only the current ones, not one per historical order.
  delete from notifications;
  insert into notifications(ts, to_supplier, kind, object, body)
    select o.sent, o.sup, 'New order', o.id, 'New purchase order ' || o.id || ': ' || o.qty || ' × ' || p.name || ' for ' || o.station || '. Please confirm and give a delivery date.'
      from pos o join parts p on p.pn = o.pn where o.status = 'Sent';
  insert into notifications(ts, to_role, kind, object, body)
    select o.acknowledged, r, 'Order confirmed', o.id, s.name || ' confirmed ' || o.id || ', promised ' || to_char(o.promised, 'DD Mon YYYY') || '.'
      from pos o join suppliers s on s.id = o.sup, unnest(array['planner', 'procurement']) r where o.status = 'Confirmed';
  insert into notifications(ts, to_role, station, kind, object, body)
    select o.shipped, 'operator', o.station, 'Shipment on its way', o.id, o.id || ' shipped by ' || s.name || ' to ' || o.station || ' · ' || coalesce(o.tracking, '') || '.'
      from pos o join suppliers s on s.id = o.sup where o.status = 'Shipped';

  -- A previous ERP extract, so reconciliation has something to compare against from the start.
  insert into erp_batches(id, ts, by_user, filename, system) values (1, now() - interval '7 days', pl, 'NAV_ItemLedger_by_Location.csv', 'Navision')
    on conflict (id) do nothing;
  insert into erp_records(batch, pn, station, qty)
    select 1, pn, loc, sum(qty) + case when pn = 'EO-2380-QT' and loc = 'LHR' then 12 when pn = 'TY-H44-5' and loc = 'SIN' then -2 else 0 end
      from items where loc is not null and cond in ('serviceable', 'pending') group by pn, loc;
  update erp_batches set rows = (select count(*) from erp_records where batch = 1) where id = 1;
  perform setval('erp_batches_id_seq', greatest(1, (select max(id) from erp_batches)));
end $$;
revoke execute on function public.seed_extras() from public, anon, authenticated;

create or replace function public.reset_demo() returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me();
begin
  if r.role not in ('admin', 'superadmin') then raise exception 'Only the Admin can reset the demo.'; end if;
  truncate events, items, requests, pos, rec_decisions, tasks, audit, sensor_reads, exceptions, erp_records, erp_batches,
    notification_reads, notifications restart identity;
  delete from settings;
  alter sequence po_seq restart with 7005; alter sequence trf_seq restart with 433; alter sequence req_seq restart with 3303;
  alter sequence ro_seq restart with 1201;
  perform seed_demo();
  perform seed_extras();
  perform _audit(r.id, 'Reset demo data', 'Database', 'Reseeded to the starting scenario');
  return 'Demo data reset to the seeded starting point.';
end $$;
revoke execute on function public.reset_demo() from public, anon;
grant execute on function public.reset_demo() to authenticated;
