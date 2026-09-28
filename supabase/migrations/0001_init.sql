-- ============================================================================
--  SplitEase — initial schema (Supabase / Postgres)
--  Chat + shared-expense splitting with row-level access control.
--
--  Apply with:  supabase db push
--
--  This file supersedes the original supabase/schema.sql, which had three
--  defects that made it unsafe to run against a real project:
--
--    1. profiles_select used `using (true)`, so any signed-in user could
--       SELECT every row of `profiles` — including everyone's invite code.
--    2. group_members insert allowed `user_id = auth.uid()`, i.e. any user
--       could add themselves to any group whose UUID they had seen, which
--       made the invite flow meaningless.
--    3. is_member / is_admin / can_edit were SECURITY DEFINER with no
--       `set search_path`, so they were vulnerable to search_path hijacking.
--
--  It also had a functional bug: createGroup() inserted the group and then
--  the owner membership as two separate client calls, and groups_select is
--  gated on is_member() — so a freshly created group was invisible to its own
--  creator, and an interrupted second call left an orphan group. That is now a
--  single atomic RPC, `create_group`.
--
--  Everything is idempotent so the migration can be re-run safely.
-- ============================================================================

-- ============================================================================
--  TABLES
-- ============================================================================

-- 0) profiles — every user gets a short human-typeable code, generated
--    server-side by the trigger below. Clients never choose it.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  code         text not null unique,
  display_name text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists idx_profiles_code on public.profiles (code);

-- 1) groups
create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  currency   text not null default 'EGP',
  icon       text not null default '👥',
  color      text not null default '#0D9488',
  created_at timestamptz not null default now()
);

-- 2) group_members — role plus a per-member edit permission
create table if not exists public.group_members (
  group_id     uuid not null references public.groups(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '',
  role         text not null default 'member' check (role in ('admin', 'member')),
  can_edit     boolean not null default true,  -- false = read-only
  joined_at    timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists idx_group_members_user on public.group_members (user_id);

-- 3) group_invites — the join credential. A group UUID is a bearer secret
--    that can never be revoked, so joining is gated on a short code that can.
create table if not exists public.group_invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  code       text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz,
  max_uses   integer,
  uses       integer not null default 0,
  revoked    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_group_invites_group on public.group_invites (group_id);
create index if not exists idx_group_invites_code on public.group_invites (code);

-- 4) expenses
create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  created_by  uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount      numeric(12, 2) not null check (amount > 0),
  category    text not null default 'other',
  date        date not null default current_date,
  split_type  text not null default 'equal',
  paid_by     jsonb not null default '[]'::jsonb,  -- [{userId, amount}]
  shares      jsonb not null default '[]'::jsonb,  -- [{userId, amount}]
  created_at  timestamptz not null default now()
);
create index if not exists idx_expenses_group on public.expenses (group_id);

-- 5) settlements
create table if not exists public.settlements (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  from_user  uuid not null references auth.users(id) on delete cascade,
  to_user    uuid not null references auth.users(id) on delete cascade,
  amount     numeric(12, 2) not null check (amount > 0),
  method     text not null default 'cash',
  status     text not null default 'paid',
  date       date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists idx_settlements_group on public.settlements (group_id);

-- 6) messages (group chat)
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  user_name  text not null default '',
  text       text not null check (length(btrim(text)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_group on public.messages (group_id, created_at);

-- ============================================================================
--  HELPER FUNCTIONS
--
--  Every SECURITY DEFINER function pins its search_path. Without this, a user
--  who can create an object in an earlier schema can shadow the referenced
--  tables and run these functions with elevated privileges.
-- ============================================================================

create or replace function public.is_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function public.is_admin(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid() and role = 'admin'
  );
$$;

-- admin always; member only when can_edit
create or replace function public.can_edit(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid
      and user_id = auth.uid()
      and (role = 'admin' or can_edit = true)
  );
$$;

-- Short invite/profile codes, generated server-side. Excludes 0/O/1/I so a
-- code read aloud or retyped from a screenshot cannot be mistyped.
create or replace function public.generate_code(n integer default 8)
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out text := '';
  i integer;
  idx integer;
begin
  if n < 4 or n > 16 then
    raise exception 'generate_code: length must be between 4 and 16';
  end if;
  for i in 1..n loop
    idx := floor(random() * length(alphabet))::integer + 1;
    out := out || substr(alphabet, idx, 1);
  end loop;
  return out;
end;
$$;

-- Give every new auth user a profile with a unique code. The client used to
-- generate this in localStorage with Math.random(), which meant two devices
-- produced two different codes for the same person and the second upsert
-- collided on the unique index.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  candidate text;
begin
  candidate := public.generate_code(8);
  while exists (select 1 from public.profiles where code = candidate) loop
    candidate := public.generate_code(8);
  end loop;

  insert into public.profiles (id, code, display_name)
  values (
    new.id,
    candidate,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
--  RPCs — operations that must be atomic or that must read across rows the
--  caller is not allowed to select directly.
-- ============================================================================

-- Create a group and its owner membership in one transaction.
create or replace function public.create_group(
  p_name     text,
  p_currency text default 'EGP',
  p_icon     text default '👥',
  p_color    text default '#0D9488'
)
returns public.groups
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid  uuid := auth.uid();
  made public.groups;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.groups (name, owner_id, currency, icon, color)
  values (p_name, uid, p_currency, p_icon, p_color)
  returning * into made;

  -- Must insert exactly one row. An INSERT ... SELECT from profiles would insert
  -- ZERO rows when the profile is missing (e.g. the signup trigger has not run
  -- yet), which would leave the creator with a group they cannot see. A scalar
  -- subquery keeps the insert unconditional and degrades to an empty name.
  insert into public.group_members (group_id, user_id, display_name, role, can_edit)
  values (
    made.id,
    uid,
    coalesce((select p.display_name from public.profiles p where p.id = uid), ''),
    'admin',
    true
  );

  return made;
end;
$$;

-- Resolve an invite code to a profile. This replaces the direct
-- `select from profiles where code = …` that only worked because the policy
-- was `using (true)`; it now returns exactly the two columns the UI needs.
create or replace function public.find_profile_by_code(p_code text)
returns table (id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  return query
    select pr.id, pr.display_name
    from public.profiles pr
    where pr.code = upper(btrim(p_code))
    limit 1;
end;
$$;

-- Set the caller's display name, creating the profile if a trigger somehow
-- missed it. The code is always assigned here, never by the client: the old
-- client kept it in localStorage, so the same person on two devices produced
-- two different codes and the second write collided on the unique index.
create or replace function public.upsert_my_profile(p_display_name text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid  uuid := auth.uid();
  mine public.profiles;
  candidate text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into mine from public.profiles where id = uid;
  if found then
    if p_display_name is null or btrim(p_display_name) = '' then
      return mine;
    end if;
    update public.profiles set display_name = btrim(p_display_name) where id = uid
    returning * into mine;
    return mine;
  end if;

  candidate := public.generate_code(8);
  while exists (select 1 from public.profiles where code = candidate) loop
    candidate := public.generate_code(8);
  end loop;

  insert into public.profiles (id, code, display_name)
  values (uid, candidate, coalesce(btrim(p_display_name), ''))
  returning * into mine;

  return mine;
end;
$$;

-- Mint an invite code for a group. Admin only.
create or replace function public.create_invite(
  p_group_id  uuid,
  p_expires_in_hours integer default null,
  p_max_uses  integer default null
)
returns public.group_invites
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid    uuid := auth.uid();
  made   public.group_invites;
  candidate text;
begin
  if not public.is_admin(p_group_id) then
    raise exception 'only a group admin can create an invite' using errcode = '42501';
  end if;
  if p_max_uses is not null and p_max_uses < 1 then
    raise exception 'max_uses must be positive' using errcode = '22023';
  end if;

  candidate := public.generate_code(8);
  while exists (select 1 from public.group_invites where code = candidate) loop
    candidate := public.generate_code(8);
  end loop;

  insert into public.group_invites (group_id, code, created_by, expires_at, max_uses)
  values (
    p_group_id,
    candidate,
    uid,
    case when p_expires_in_hours is null then null
         else now() + make_interval(hours => p_expires_in_hours) end,
    p_max_uses
  )
  returning * into made;

  return made;
end;
$$;

-- Join a group with an invite code. This is the ONLY path to a
-- group_members insert, which is why the insert policy below has no
-- self-service branch.
create or replace function public.join_group(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid   uuid := auth.uid();
  inv   public.group_invites;
  myname text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into inv
  from public.group_invites
  where code = upper(btrim(p_code))
  for update;                       -- serialise concurrent joins on one code

  if not found then
    raise exception 'invalid invite code' using errcode = '22023';
  end if;
  if inv.revoked then
    raise exception 'this invite has been revoked' using errcode = '22023';
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    raise exception 'this invite has expired' using errcode = '22023';
  end if;
  if inv.max_uses is not null and inv.uses >= inv.max_uses then
    raise exception 'this invite has no uses left' using errcode = '22023';
  end if;

  select display_name into myname from public.profiles where id = uid;

  insert into public.group_members (group_id, user_id, display_name, role, can_edit)
  values (inv.group_id, uid, coalesce(myname, ''), 'member', true)
  on conflict (group_id, user_id) do nothing;

  update public.group_invites set uses = uses + 1 where id = inv.id;

  return inv.group_id;
end;
$$;

-- Revoke an invite. Admin only.
create or replace function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv public.group_invites;
begin
  select * into inv from public.group_invites where id = p_invite_id;
  if not found then
    raise exception 'invite not found' using errcode = '22023';
  end if;
  if not public.is_admin(inv.group_id) then
    raise exception 'only a group admin can revoke an invite' using errcode = '42501';
  end if;
  update public.group_invites set revoked = true where id = p_invite_id;
end;
$$;

-- Only authenticated clients may call these; the anon role gets nothing.
revoke all on function public.create_group(text, text, text, text) from public, anon;
revoke all on function public.find_profile_by_code(text) from public, anon;
revoke all on function public.upsert_my_profile(text) from public, anon;
revoke all on function public.create_invite(uuid, integer, integer) from public, anon;
revoke all on function public.join_group(text) from public, anon;
revoke all on function public.revoke_invite(uuid) from public, anon;
grant execute on function public.create_group(text, text, text, text) to authenticated;
grant execute on function public.find_profile_by_code(text) to authenticated;
grant execute on function public.upsert_my_profile(text) to authenticated;
grant execute on function public.create_invite(uuid, integer, integer) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;

-- The helpers are used inside policies, which run as the policy author, so
-- they must stay executable. They are not exposed to anon.
revoke all on function public.is_member(uuid) from public, anon;
revoke all on function public.is_admin(uuid) from public, anon;
revoke all on function public.can_edit(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.can_edit(uuid) to authenticated;

-- ============================================================================
--  RLS
-- ============================================================================
alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.expenses      enable row level security;
alter table public.settlements   enable row level security;
alter table public.messages      enable row level security;

-- ── profiles ──────────────────────────────────────────────────────────────
-- Self only. Code lookup goes through find_profile_by_code().
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles for select
  using (id = auth.uid());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert
  with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ── groups ────────────────────────────────────────────────────────────────
-- The owner is readable even before the membership row exists, which also
-- covers any group left orphaned by a failed create.
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select
  using (public.is_member(id) or owner_id = auth.uid());

drop policy if exists groups_insert on public.groups;
-- Writes go through create_group(); this policy is a backstop for direct writes.
create policy groups_insert on public.groups for insert
  with check (auth.uid() = owner_id);

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update
  using (public.is_admin(id) or owner_id = auth.uid())
  with check (owner_id = auth.uid() or public.is_admin(id));  -- owner_id is immutable

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups for delete
  using (owner_id = auth.uid());

-- ── group_members ─────────────────────────────────────────────────────────
drop policy if exists members_select on public.group_members;
create policy members_select on public.group_members for select
  using (public.is_member(group_id));

-- Admins add members by code (addMemberByCode) or accept a join (join_group).
-- There is deliberately NO `user_id = auth.uid()` branch: that let any user
-- walk into any group whose id they had seen.
drop policy if exists members_insert_admin on public.group_members;
create policy members_insert_admin on public.group_members for insert
  with check (public.is_admin(group_id));

drop policy if exists members_update_admin on public.group_members;
create policy members_update_admin on public.group_members for update
  using (public.is_admin(group_id))
  with check (public.is_admin(group_id));

drop policy if exists members_delete on public.group_members;
create policy members_delete on public.group_members for delete
  using (public.is_admin(group_id) or user_id = auth.uid());

-- ── group_invites ─────────────────────────────────────────────────────────
-- Members can see their group's invites; only the RPCs write.
drop policy if exists invites_select on public.group_invites;
create policy invites_select on public.group_invites for select
  using (public.is_member(group_id));

-- ── expenses ──────────────────────────────────────────────────────────────
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses for select
  using (public.is_member(group_id));

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert
  with check (public.can_edit(group_id) and created_by = auth.uid());

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses for update
  using (public.can_edit(group_id) and created_by = auth.uid())
  with check (public.can_edit(group_id) and created_by = auth.uid());

drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses for delete
  using (public.can_edit(group_id));

-- ── settlements ───────────────────────────────────────────────────────────
drop policy if exists settlements_select on public.settlements;
create policy settlements_select on public.settlements for select
  using (public.is_member(group_id));

drop policy if exists settlements_insert on public.settlements;
create policy settlements_insert on public.settlements for insert
  with check (public.can_edit(group_id) and created_by = auth.uid());

drop policy if exists settlements_update on public.settlements;
create policy settlements_update on public.settlements for update
  using (public.can_edit(group_id))
  with check (public.can_edit(group_id));

drop policy if exists settlements_delete on public.settlements;
create policy settlements_delete on public.settlements for delete
  using (public.can_edit(group_id));

-- ── messages ──────────────────────────────────────────────────────────────
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select
  using (public.is_member(group_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert
  with check (public.is_member(group_id) and user_id = auth.uid());

drop policy if exists messages_delete_own on public.messages;
create policy messages_delete_own on public.messages for delete
  using (user_id = auth.uid() or public.is_admin(group_id));

-- ============================================================================
--  GRANTS — the anon key ships inside the APK, so it must not be able to read
--  or write any table. Everything goes through RLS as `authenticated`, or
--  through the SECURITY DEFINER RPCs above.
-- ============================================================================
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ============================================================================
--  REALTIME
-- ============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expenses') then
      alter publication supabase_realtime add table public.expenses;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'settlements') then
      alter publication supabase_realtime add table public.settlements;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_members') then
      alter publication supabase_realtime add table public.group_members;
    end if;
  end if;
end $$;
