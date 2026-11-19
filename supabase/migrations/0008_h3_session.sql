-- H3 session support: prepare the database for a volunteer session and log the timing of each order.
-- h3_prepare(set) resets the demo world, clears the six seeded recommendations, and draws stock down so
-- that exactly the ten orders of that set appear as recommendations (5 at or above the approval limit,
-- 5 below). The draw-downs were computed with the app's own reorder points from the seeded state.

create table if not exists public.h3_log (
  id bigserial primary key, ts timestamptz not null default now(), session text not null,
  arm text not null check (arm in ('manual', 'avilo')), set_name text not null check (set_name in ('A', 'B')),
  order_no int not null check (order_no between 0 and 10), pn text references public.parts(pn), station text,
  step text not null check (step in ('start', 'approved', 'confirmed', 'received', 'serviceable', 'error', 'void')),
  note text, by_user uuid references public.profiles(id)
);
alter table public.h3_log enable row level security;
create policy "admins read h3 log" on public.h3_log for select to authenticated using (public.my_role() in ('admin', 'superadmin', 'planner', 'procurement'));
revoke insert, update, delete, truncate on public.h3_log from anon, authenticated;
revoke all on public.h3_log from anon;

create or replace function public.h3_mark(p_session text, p_arm text, p_set text, p_order int, p_pn text, p_station text, p_step text, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me();
begin
  if r.role not in ('admin', 'superadmin') then raise exception 'Only the Admin runs the session timer.'; end if;
  if coalesce(trim(p_session), '') = '' then raise exception 'Name the session first.'; end if;
  insert into h3_log(session, arm, set_name, order_no, pn, station, step, note, by_user)
  values (trim(p_session), p_arm, p_set, p_order, p_pn, p_station, p_step, nullif(trim(coalesce(p_note, '')), ''), r.id);
  return p_step || ' recorded for order ' || p_order || '.';
end $$;

-- Reset that keeps the account audit trail (accounts outlive the demo data).
create or replace function public._reset_world() returns void
language plpgsql security definer set search_path = public as $$
begin
  create temp table keep_audit on commit drop as select ts, by_user, action, object, detail from audit
    where action in ('Requested account', 'Approved account request', 'Rejected account request', 'Created account', 'Cancelled account request',
                     'Requested role change', 'Approved role change', 'Changed role', 'Deactivated account', 'Reactivated account',
                     'Requested reactivation', 'Approved reactivation', 'Set own password');
  truncate events, items, requests, pos, rec_decisions, tasks, audit, sensor_reads, exceptions, erp_records, erp_batches,
    notification_reads, notifications restart identity;
  insert into audit(ts, by_user, action, object, detail) select ts, by_user, action, object, detail from keep_audit order by ts;
  delete from settings;
  alter sequence po_seq restart with 7005; alter sequence trf_seq restart with 433; alter sequence req_seq restart with 3303;
  alter sequence ro_seq restart with 1201;
  perform seed_demo();
  perform seed_extras();
end $$;
revoke execute on function public._reset_world() from public, anon, authenticated;

create or replace function public.reset_demo() returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me();
begin
  if r.role not in ('admin', 'superadmin') then raise exception 'Only the Admin can reset the demo.'; end if;
  perform _reset_world();
  perform _audit(r.id, 'Reset demo data', 'Database', 'Reseeded to the starting scenario');
  return 'Demo data reset to the seeded starting point.';
end $$;

create or replace function public.h3_prepare(p_set text) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); x jsonb; pt parts; it items; need numeric; take numeric; n int := 11800; k int;
  issues jsonb := '{"A": [["3505986-12", "SIN", 1], ["5009873-7", "DXB", 1], ["3214552-3", "DXB", 3], ["3291460-5", "SIN", 1], ["NW-277104", "LOS", 1], ["OF-1290-8", "DXB", 2], ["HF-500B-GL", "LOS", 7], ["EO-2380-QT", "SIN", 35], ["LL-4596-1", "SIN", 1], ["OK-29-104", "LOS", 2]], "B": [["3800706-2", "LOS", 1], ["5009873-7", "LOS", 1], ["2C1185-04", "LHR", 1], ["3291460-5", "DXB", 1], ["NW-277104", "SIN", 1], ["OF-1290-8", "SIN", 1], ["HF-500B-GL", "DXB", 24], ["EO-2380-QT", "DXB", 56], ["LL-4596-1", "DXB", 3], ["OK-29-104", "DXB", 12]]}'::jsonb;
  topups jsonb := '[["3214552-3", "LHR", 5], ["3505986-12", "LHR", 3], ["2C1185-04", "SIN", 4], ["AD-822410", "LHR", 4], ["TY-H44-5", "LOS", 3], ["OF-1290-8", "LHR", 4]]'::jsonb;
  tail text;
begin
  if r.role not in ('admin', 'superadmin') then raise exception 'Only the Admin can prepare a session.'; end if;
  if p_set not in ('A', 'B') then raise exception 'Choose set A or B.'; end if;
  perform _reset_world();
  -- clear the seeded recommendations so only this set's ten appear
  for x in select value from jsonb_array_elements(topups) loop
    select * into pt from parts where pn = x->>0;
    if pt.type = 'rotable' then
      for k in 1..(x->>2)::int loop
        n := n + 1;
        insert into events(ts, type, item, pn, qty, to_st, cond, cert, ref, source)
          values (now() - interval '30 days', 'RECEIVE', pt.prefix || '-' || n, pt.pn, 1, x->>1, 'serviceable', 'EASA Form 1', 'H3 set-up', 'H3 set-up');
      end loop;
    else
      insert into events(ts, type, item, pn, qty, to_st, cond, cert, ref, expiry, source)
        values (now() - interval '30 days', 'RECEIVE', pt.prefix || '-' || (x->>1) || '-H3', pt.pn, (x->>2)::int, x->>1, 'serviceable', 'CoC', 'H3 set-up',
                case when pt.shelf is not null then now() + make_interval(days => pt.shelf - 30) end, 'H3 set-up');
    end if;
  end loop;
  -- draw stock down to the reorder point for the ten orders of the set (recent use by engineering)
  for x in select value from jsonb_array_elements(issues -> p_set) loop
    select * into pt from parts where pn = x->>0;
    need := (x->>2)::numeric;
    tail := (select (array['AVL-01','AVL-03','AVL-04','AVL-05','AVL-06'])[1 + floor(random() * 5)::int]);
    while need > 0 loop
      select * into it from items where pn = pt.pn and loc = x->>1 and cond = 'serviceable' and reserved is null and transit is null and qty > 0 order by qty desc, id limit 1;
      if it.id is null then raise exception 'Not enough % at % to prepare set %.', pt.pn, x->>1, p_set; end if;
      take := case when pt.type = 'rotable' then 1 else least(need, it.qty) end;
      insert into events(ts, type, item, pn, qty, from_st, ref, aircraft, source)
        values (now() - interval '2 hours', 'ISSUE', it.id, pt.pn, take, x->>1, 'WO-H3', tail, 'H3 set-up');
      need := need - take;
    end loop;
  end loop;
  perform _audit(r.id, 'Prepared H3 session', 'Set ' || p_set, '10 orders ready for the Avilo arm');
  return 'Set ' || p_set || ' is ready: ten recommendations are waiting for the Planner.';
end $$;

grant execute on function public.h3_mark(text, text, text, int, text, text, text, text), public.h3_prepare(text) to authenticated;
revoke execute on function public.h3_mark(text, text, text, int, text, text, text, text), public.h3_prepare(text) from public, anon;
alter publication supabase_realtime add table public.h3_log;
