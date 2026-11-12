-- Avilo schema: an append-only stock ledger, its projection, and every workflow table.
-- All writes go through SECURITY DEFINER functions that enforce role, location scope and
-- separation of duties. Tables have row-level security with read policies only.

create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null,
  name text not null,
  role text not null check (role in ('superadmin','admin','operator','technician','planner','procurement','compliance','supplier','viewer')),
  scope text[] not null default '{}',
  supplier text,
  email text
);

create table public.suppliers (id text primary key, name text not null, code text not null, approved boolean not null default true);

create table public.parts (
  pn text primary key, name text not null,
  type text not null check (type in ('rotable','consumable')),
  unit text not null, cost numeric not null, lead int not null,
  crit text not null check (crit in ('A','B','C')),
  sup text not null references public.suppliers(id),
  prefix text not null, shelf int
);

create table public.events (
  id bigserial primary key,
  ts timestamptz not null default now(),
  type text not null check (type in ('RECEIVE','VERIFY','CONDITION','TRANSFER_OUT','TRANSFER_IN','ISSUE','RESERVE','RELEASE','TURN_IN','ADJUST','SCRAP')),
  item text, pn text references public.parts(pn), qty numeric,
  from_st text, to_st text, trf text, ref text, aircraft text,
  cond text, cert text, reason text, expiry timestamptz,
  actor uuid references public.profiles(id),
  source text not null default 'Avilo'
);
create index on public.events (item);
create index on public.events (trf);

create table public.items (
  id text primary key, pn text not null references public.parts(pn), qty numeric not null,
  loc text, cond text not null, transit jsonb, reserved text, expiry timestamptz,
  cert text, ref text, since timestamptz, on_aircraft text, parent text
);

create table public.requests (
  id text primary key, pn text not null references public.parts(pn), qty int not null default 1,
  station text not null, aircraft text not null, wo text,
  priority text not null check (priority in ('Routine','AOG')),
  status text not null default 'Open', by_user uuid references public.profiles(id),
  ts timestamptz not null default now(), note text
);

create table public.pos (
  id text primary key, sup text not null references public.suppliers(id), pn text not null references public.parts(pn),
  qty int not null, station text not null, value numeric not null, status text not null,
  sent timestamptz, promised timestamptz, shipped timestamptz, received timestamptz,
  tracking text, approvals jsonb not null default '[]', aog boolean not null default false,
  note text, cert_uploaded boolean not null default false
);

create table public.rec_decisions (
  id text primary key, status text not null, approvals jsonb not null default '[]',
  po text, note text, raised_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);

create table public.tasks (
  id bigserial primary key, pn text not null references public.parts(pn), qty int not null,
  from_st text not null, to_st text not null, req text, status text not null default 'Open',
  why text, created_at timestamptz not null default now()
);

create table public.audit (
  id bigserial primary key, ts timestamptz not null default now(),
  by_user uuid references public.profiles(id), action text not null, object text, detail text
);

create table public.settings (key text primary key, value jsonb not null);

create sequence public.po_seq start 7005;
create sequence public.trf_seq start 433;
create sequence public.req_seq start 3303;

-- The ledger and the audit log can never be edited or deleted row by row.
create or replace function public.forbid_change() returns trigger language plpgsql set search_path = public as $$
begin raise exception '% is append-only. Record a correcting event instead.', tg_table_name; end $$;
create trigger events_append_only before update or delete on public.events for each row execute function public.forbid_change();
create trigger audit_append_only before update or delete on public.audit for each row execute function public.forbid_change();

-- Projection: stock is derived from events in the same transaction.
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
  else null;
  end case;
  return new;
end $$;
create trigger events_project after insert on public.events for each row execute function public.apply_event();

-- Helpers
create or replace function public.my_role() returns text language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;
create or replace function public.my_supplier() returns text language sql stable security definer set search_path = public as
$$ select supplier from profiles where id = auth.uid() $$;
create or replace function public._me() returns public.profiles language plpgsql stable security definer set search_path = public as $$
declare r profiles;
begin
  select * into r from profiles where id = auth.uid();
  if r.id is null then raise exception 'Sign in first.'; end if;
  return r;
end $$;
create or replace function public._audit(p_by uuid, p_action text, p_object text, p_detail text) returns void
language sql security definer set search_path = public as
$$ insert into audit(by_user, action, object, detail) values (p_by, p_action, p_object, coalesce(p_detail, '')) $$;

-- Row-level security: read policies only. No role can write to a table directly.
alter table public.profiles enable row level security;
alter table public.suppliers enable row level security;
alter table public.parts enable row level security;
alter table public.events enable row level security;
alter table public.items enable row level security;
alter table public.requests enable row level security;
alter table public.pos enable row level security;
alter table public.rec_decisions enable row level security;
alter table public.tasks enable row level security;
alter table public.audit enable row level security;
alter table public.settings enable row level security;

create policy "read profiles" on public.profiles for select to authenticated using (true);
create policy "read suppliers" on public.suppliers for select to authenticated using (true);
create policy "read parts" on public.parts for select to authenticated using (true);
create policy "read settings" on public.settings for select to authenticated using (true);
create policy "internal staff read ledger" on public.events for select to authenticated using (public.my_role() <> 'supplier');
create policy "internal staff read stock" on public.items for select to authenticated using (public.my_role() <> 'supplier');
create policy "internal staff read requests" on public.requests for select to authenticated using (public.my_role() <> 'supplier');
create policy "internal staff read decisions" on public.rec_decisions for select to authenticated using (public.my_role() <> 'supplier');
create policy "internal staff read tasks" on public.tasks for select to authenticated using (public.my_role() <> 'supplier');
create policy "orders: staff all, supplier own" on public.pos for select to authenticated
  using (public.my_role() <> 'supplier' or sup = public.my_supplier());
create policy "audit readers" on public.audit for select to authenticated
  using (public.my_role() in ('admin', 'compliance', 'superadmin'));

revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon;
