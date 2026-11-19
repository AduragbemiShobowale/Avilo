-- Account management. Accounts are never self-registered: the Admin requests them, and any account that
-- can approve spending, certify parts or administer the system needs the Procurement Manager's agreement
-- first (the same two-person rule as the approval limit). Creating the login itself needs the service key,
-- so the final step runs in the `create-account` edge function. Accounts are deactivated, never deleted,
-- so the audit trail keeps every name.

alter table public.profiles add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles add column if not exists created_by uuid references public.profiles(id);
alter table public.profiles add column if not exists created_at timestamptz not null default now();

create table if not exists public.account_requests (
  id bigserial primary key, ts timestamptz not null default now(),
  kind text not null check (kind in ('create', 'role', 'reactivate')),
  target uuid references public.profiles(id), email text, name text,
  role text not null check (role in ('admin','operator','technician','planner','procurement','compliance','supplier')),
  scope text[] not null default '{}', supplier text references public.suppliers(id),
  requested_by uuid not null references public.profiles(id),
  status text not null default 'Awaiting approval' check (status in ('Awaiting approval', 'Approved', 'Rejected', 'Done', 'Cancelled')),
  decided_by uuid references public.profiles(id), decided_at timestamptz, done_at timestamptz, note text
);

-- Roles that can move money, certify parts or change the system.
create or replace function public._high_risk(p_role text) returns boolean language sql immutable as
$$ select p_role in ('planner', 'procurement', 'compliance', 'admin') $$;

-- A deactivated account can still sign in to Supabase Auth, but every server function and read policy refuses it.
create or replace function public._me() returns public.profiles language plpgsql stable security definer set search_path = public as $$
declare r profiles;
begin
  select * into r from profiles where id = auth.uid();
  if r.id is null then raise exception 'Sign in first.'; end if;
  if not r.active then raise exception 'This account has been deactivated.'; end if;
  return r;
end $$;
create or replace function public.my_role() returns text language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and active $$;

create or replace function public._check_account(p_role text, p_scope text[], p_supplier text) returns void
language plpgsql stable set search_path = public as $$
begin
  if p_role not in ('admin','operator','technician','planner','procurement','compliance','supplier') then raise exception 'Choose a role.'; end if;
  if exists (select 1 from unnest(coalesce(p_scope, '{}')) s where s not in ('LHR', 'SIN', 'LOS', 'DXB')) then raise exception 'Unknown station in the scope.'; end if;
  if p_role in ('operator', 'technician') and coalesce(array_length(p_scope, 1), 0) = 0 then raise exception 'Stores operators and technicians need at least one station.'; end if;
  if p_role = 'supplier' and (p_supplier is null or not exists (select 1 from suppliers where id = p_supplier)) then raise exception 'Choose the supplier company.'; end if;
end $$;

create or replace function public.request_account(p_email text, p_name text, p_role text, p_scope text[], p_supplier text) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); e text := lower(trim(p_email)); id_ bigint; hi boolean := _high_risk(p_role);
begin
  if r.role <> 'admin' then raise exception 'Only the Admin can request new accounts.'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid e-mail address.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter the person''s name.'; end if;
  perform _check_account(p_role, p_scope, p_supplier);
  if exists (select 1 from profiles where lower(email) = e) or exists (select 1 from auth.users where lower(email) = e) then raise exception '% already has an account.', e; end if;
  if exists (select 1 from account_requests where kind = 'create' and lower(email) = e and status in ('Awaiting approval', 'Approved')) then raise exception 'There is already an open request for %.', e; end if;
  insert into account_requests(kind, email, name, role, scope, supplier, requested_by, status)
  values ('create', e, trim(p_name), p_role, case when p_role in ('operator', 'technician') then p_scope when p_role = 'supplier' then '{}'::text[] else '{LHR,SIN,LOS,DXB}'::text[] end,
          case when p_role = 'supplier' then p_supplier end, r.id, case when hi then 'Awaiting approval' else 'Approved' end)
  returning id into id_;
  perform _audit(r.id, 'Requested account', e, p_role || case when hi then ' · needs Procurement Manager approval' else '' end);
  if hi then insert into notifications(to_role, kind, object, body) values ('procurement', 'Account to approve', 'ACC-' || id_, r.name || ' asks for a ' || p_role || ' account for ' || trim(p_name) || ' (' || e || '). Approve or reject in Users & limits.'); end if;
  return case when hi then 'Request sent. The Procurement Manager must approve a ' || p_role || ' account before it can be created.' else 'Approved. Press “Create account” to issue the login.' end;
end $$;

create or replace function public.request_role_change(p_user uuid, p_role text, p_scope text[], p_supplier text) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); t profiles; id_ bigint; sc text[];
begin
  if r.role <> 'admin' then raise exception 'Only the Admin can change roles.'; end if;
  select * into t from profiles where id = p_user;
  if t.id is null then raise exception 'Unknown user.'; end if;
  if t.id = r.id then raise exception 'You cannot change your own role.'; end if;
  if t.role = 'superadmin' then raise exception 'Avilo Support accounts are managed by Avilo.'; end if;
  perform _check_account(p_role, p_scope, p_supplier);
  sc := case when p_role in ('operator', 'technician') then p_scope when p_role = 'supplier' then '{}'::text[] else '{LHR,SIN,LOS,DXB}'::text[] end;
  if _high_risk(p_role) and (p_role <> t.role) then
    insert into account_requests(kind, target, email, name, role, scope, supplier, requested_by)
    values ('role', t.id, t.email, t.name, p_role, sc, case when p_role = 'supplier' then p_supplier end, r.id) returning id into id_;
    perform _audit(r.id, 'Requested role change', t.name, t.role || ' → ' || p_role || ' · needs Procurement Manager approval');
    insert into notifications(to_role, kind, object, body) values ('procurement', 'Role change to approve', 'ACC-' || id_, r.name || ' asks to make ' || t.name || ' a ' || p_role || '. Approve or reject in Users & limits.');
    return 'Request sent. The Procurement Manager must approve it.';
  end if;
  update profiles set role = p_role, scope = sc, supplier = case when p_role = 'supplier' then p_supplier end where id = t.id;
  perform _audit(r.id, 'Changed role', t.name, t.role || ' → ' || p_role || ' · ' || array_to_string(sc, ', '));
  return t.name || ' is now ' || p_role || '.';
end $$;

create or replace function public.set_account_active(p_user uuid, p_active boolean) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); t profiles; id_ bigint;
begin
  if r.role <> 'admin' then raise exception 'Only the Admin can deactivate or reactivate accounts.'; end if;
  select * into t from profiles where id = p_user;
  if t.id is null then raise exception 'Unknown user.'; end if;
  if t.id = r.id then raise exception 'You cannot deactivate your own account.'; end if;
  if t.role = 'superadmin' then raise exception 'Avilo Support accounts are managed by Avilo.'; end if;
  if not p_active then
    update profiles set active = false where id = t.id;
    perform _audit(r.id, 'Deactivated account', t.name, t.email);
    return t.name || ' can no longer use Avilo. Their history stays in the audit log.';
  end if;
  if _high_risk(t.role) then
    insert into account_requests(kind, target, email, name, role, scope, supplier, requested_by)
    values ('reactivate', t.id, t.email, t.name, t.role, t.scope, t.supplier, r.id) returning id into id_;
    perform _audit(r.id, 'Requested reactivation', t.name, t.role || ' · needs Procurement Manager approval');
    insert into notifications(to_role, kind, object, body) values ('procurement', 'Reactivation to approve', 'ACC-' || id_, r.name || ' asks to reactivate ' || t.name || ' (' || t.role || ').');
    return 'Request sent. The Procurement Manager must approve reactivating a ' || t.role || '.';
  end if;
  update profiles set active = true where id = t.id;
  perform _audit(r.id, 'Reactivated account', t.name, t.email);
  return t.name || ' can use Avilo again.';
end $$;

create or replace function public.decide_account_request(p_id bigint, p_ok boolean) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); q account_requests;
begin
  if r.role <> 'procurement' then raise exception 'Only the Procurement Manager can approve account requests.'; end if;
  select * into q from account_requests where id = p_id for update;
  if q.id is null or q.status <> 'Awaiting approval' then raise exception 'That request is not waiting for a decision.'; end if;
  if q.requested_by = r.id or q.target = r.id then raise exception 'You cannot decide a request you made or one about yourself.'; end if;
  if not p_ok then
    update account_requests set status = 'Rejected', decided_by = r.id, decided_at = now() where id = p_id;
    perform _audit(r.id, 'Rejected account request', coalesce(q.email, q.name), q.kind || ' · ' || q.role);
    return 'Rejected.';
  end if;
  if q.kind = 'create' then
    update account_requests set status = 'Approved', decided_by = r.id, decided_at = now() where id = p_id;
    perform _audit(r.id, 'Approved account request', q.email, q.role);
    return 'Approved. The Admin can now create the login.';
  end if;
  if q.kind = 'role' then update profiles set role = q.role, scope = q.scope, supplier = q.supplier where id = q.target;
  else update profiles set active = true where id = q.target; end if;
  update account_requests set status = 'Done', decided_by = r.id, decided_at = now(), done_at = now() where id = p_id;
  perform _audit(r.id, case q.kind when 'role' then 'Approved role change' else 'Approved reactivation' end, q.name, q.role);
  return 'Approved and applied.';
end $$;

create or replace function public.cancel_account_request(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare r profiles := _me(); q account_requests;
begin
  if r.role <> 'admin' then raise exception 'Only the Admin can cancel account requests.'; end if;
  select * into q from account_requests where id = p_id for update;
  if q.id is null or q.status not in ('Awaiting approval', 'Approved') then raise exception 'That request is already closed.'; end if;
  update account_requests set status = 'Cancelled', done_at = now() where id = p_id;
  perform _audit(r.id, 'Cancelled account request', coalesce(q.email, q.name), q.kind);
  return 'Request cancelled.';
end $$;

create or replace function public.password_changed() returns void
language plpgsql security definer set search_path = public as $$
declare r profiles := _me();
begin
  if r.must_change_password then
    update profiles set must_change_password = false where id = r.id;
    perform _audit(r.id, 'Set own password', r.email, 'First sign-in');
  end if;
end $$;

alter table public.account_requests enable row level security;
create policy "admins read account requests" on public.account_requests for select to authenticated
  using (public.my_role() in ('admin', 'procurement', 'superadmin'));
revoke insert, update, delete, truncate on public.account_requests from anon, authenticated;
revoke all on public.account_requests from anon;

revoke execute on function public._high_risk(text), public._check_account(text, text[], text) from public, anon, authenticated;
grant execute on function public.request_account(text, text, text, text[], text), public.request_role_change(uuid, text, text[], text),
  public.set_account_active(uuid, boolean), public.decide_account_request(bigint, boolean), public.cancel_account_request(bigint),
  public.password_changed() to authenticated;
revoke execute on function public.request_account(text, text, text, text[], text), public.request_role_change(uuid, text, text[], text),
  public.set_account_active(uuid, boolean), public.decide_account_request(bigint, boolean), public.cancel_account_request(bigint),
  public.password_changed() from public, anon;
alter publication supabase_realtime add table public.account_requests, public.profiles;
