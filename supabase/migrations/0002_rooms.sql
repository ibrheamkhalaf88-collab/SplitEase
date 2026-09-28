-- ============================================================================
--  SplitEase — rooms (forum-style groups gated by a join password)
--
--  Apply with:  supabase db push
--
--  A "room" is a row in `groups`. What this migration adds on top of
--  0001_init.sql is the forum-shaped behaviour a shared expense app needs:
--
--    * every account is its own identity, and each room has exactly one admin
--      (already true in 0001),
--    * a room is typed — 'friends' (شلة) or 'family' (عائلة),
--    * a room is opened with a name you can say out loud plus a password, not
--      only an invite code,
--    * every member picks the name they answer to inside that room.
--
--  Security shape of the password:
--
--    * The hash lives in `room_secrets`: row level security enabled, ZERO
--      policies, and every grant revoked from `public`, `anon` and
--      `authenticated`. Supabase installs `alter default privileges` that hand
--      every *new* table to `anon`, so the explicit revoke below is load
--      bearing — it is what stops the anon key inside the APK from reading a
--      single hash.
--    * Only SECURITY DEFINER functions reach it, each with
--      `set search_path = public, pg_temp`.
--    * `join_room` never raises on a bad password. It returns
--      `{"ok": false, "error": "invalid_credentials"}` for a name that does
--      not exist, a room with no password, and a wrong password alike, so the
--      response cannot be used to test whether a room name is taken. Raising
--      would also roll back the failed-attempt counter, so the throttle would
--      never see the attempt.
--    * Attempts are throttled per *account* (`login_throttle`), not per room.
--      A per-room counter would be an oracle: hitting it five times would
--      prove the room exists. The response only ever says "too many attempts"
--      about the caller, which leaks nothing about any room. Per-IP limiting
--      would need an Edge Function — PostgREST does not expose the client IP
--      reliably — and is left as follow-up.
--
--  Everything is idempotent so the migration can be re-run safely.
-- ============================================================================

-- ============================================================================
--  COLUMNS
-- ============================================================================

-- Room type: 'friends' = شلة, 'family' = عائلة. Existing rows default to
-- 'friends', which is what the pre-room product called a group.
alter table public.groups
  add column if not exists room_type text not null default 'friends'
  check (room_type in ('friends', 'family'));

-- A room is found by typing its name, so the name has to be unique. `lower`
-- plus `btrim` means "العائلة " and "العائلة" are the same room. This index is
-- what makes the name a safe lookup key; without it join_room would have to
-- pick arbitrarily among matches. It must be created on a database whose
-- group names are already distinct — it fails loudly otherwise, which is the
-- right behaviour, because an ambiguous join key is worse than a failed push.
create unique index if not exists idx_groups_name_lower
  on public.groups (lower(btrim(name)));

-- ============================================================================
--  TABLES
-- ============================================================================

-- 1) room_secrets — the password hash, and nothing else about the room.
--    Nobody but a SECURITY DEFINER function may read it: see the revokes
--    immediately below.
create table if not exists public.room_secrets (
  room_id       uuid primary key references public.groups(id) on delete cascade,
  password_hash text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.room_secrets enable row level security;

-- Supabase grants every new table to `anon` and `authenticated` through
-- `alter default privileges`. The anon key ships inside the APK, so it gets
-- nothing here — not even a row count. RLS with zero policies would already
-- block reads, but revoke removes the *option* of someone adding a policy
-- later without noticing.
drop policy if exists room_secrets_select on public.room_secrets;
drop policy if exists room_secrets_insert on public.room_secrets;
drop policy if exists room_secrets_update on public.room_secrets;
drop policy if exists room_secrets_delete on public.room_secrets;
revoke all on public.room_secrets from public, anon, authenticated;
grant all on public.room_secrets to service_role;

-- 2) login_throttle — failed join attempts, keyed on the caller.
--    Also not readable by clients; it exists so join_room can count attempts.
create table if not exists public.login_throttle (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  fail_count   integer not null default 0,
  last_fail_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

alter table public.login_throttle enable row level security;

drop policy if exists login_throttle_select on public.login_throttle;
drop policy if exists login_throttle_insert on public.login_throttle;
drop policy if exists login_throttle_update on public.login_throttle;
drop policy if exists login_throttle_delete on public.login_throttle;
revoke all on public.login_throttle from public, anon, authenticated;
grant all on public.login_throttle to service_role;

-- pgcrypto supplies crypt()/gen_salt(). Supabase installs it into the
-- `extensions` schema; `if not exists` makes that a no-op if it is already
-- there. The guard below keeps one missing privilege from cancelling the whole
-- migration push (a single failing statement rolls back every file in it).
do $$
begin
  create extension if not exists pgcrypto with schema extensions;
exception when others then
  begin
    create extension if not exists pgcrypto;
  exception when others then
    raise notice 'pgcrypto could not be installed (%): %', sqlstate, sqlerrm;
  end;
end $$;

-- ============================================================================
--  RPCs
-- ============================================================================

-- Create a room: the group row, the owner membership and the password hash are
-- written in one transaction, so a room can never exist unopenable or
-- openable with no password.
create or replace function public.create_room(
  p_name         text,
  p_password     text,
  p_room_type    text default 'friends',
  p_currency     text default 'EGP',
  p_display_name text default null
)
returns public.groups
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid    uuid := auth.uid();
  made   public.groups;
  room   text := coalesce(btrim(p_name), '');
  myname text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if length(room) < 2 or length(room) > 60 then
    raise exception 'room name must be between 2 and 60 characters' using errcode = '22023';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'room password must be at least 6 characters' using errcode = '22023';
  end if;
  if p_room_type is null or p_room_type not in ('friends', 'family') then
    raise exception 'room type must be friends or family' using errcode = '22023';
  end if;
  if exists (select 1 from public.groups g where lower(btrim(g.name)) = lower(room)) then
    raise exception 'room name already taken' using errcode = '23505';
  end if;

  insert into public.groups (name, owner_id, currency, icon, color, room_type)
  values (room, uid, coalesce(p_currency, 'EGP'),
          case p_room_type when 'family' then '🏠' else '👥' end,
          '#0D9488', p_room_type)
  returning * into made;

  -- Unconditional VALUES insert, never INSERT ... SELECT from profiles: a
  -- missing profile row would silently insert zero rows and leave the creator
  -- with a room groups_select cannot show them. See 0001 create_group.
  if p_display_name is not null and btrim(p_display_name) <> '' then
    myname := btrim(p_display_name);
  else
    select display_name into myname from public.profiles where id = uid;
  end if;

  insert into public.group_members (group_id, user_id, display_name, role, can_edit)
  values (made.id, uid, coalesce(myname, ''), 'admin', true);

  insert into public.room_secrets (room_id, password_hash)
  values (made.id, extensions.crypt(p_password, extensions.gen_salt('bf', 10)))
  on conflict (room_id) do update
    set password_hash = excluded.password_hash, updated_at = now();

  return made;
end;
$$;

-- Open a room by name + password and pick the name you answer to inside it.
-- Never raises: every refusal is the same jsonb, and returning (rather than
-- raising) is what lets the failed-attempt counter survive.
create or replace function public.join_room(
  p_name         text,
  p_password     text,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  lock_window constant interval := interval '15 minutes';
  max_fails   constant integer  := 5;
  uid     uuid := auth.uid();
  now_ts  timestamptz := now();
  rkey    text := lower(coalesce(btrim(p_name), ''));
  gid     uuid := null;
  sechash text := null;
  th      public.login_throttle;
  nfails  integer;
  myname  text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into th from public.login_throttle where user_id = uid for update;

  if th.user_id is not null then
    if th.locked_until is not null and th.locked_until > now_ts then
      return jsonb_build_object(
        'ok', false, 'error', 'too_many_attempts',
        'retry_after', greatest(0, ceil(extract(epoch from (th.locked_until - now_ts))))::int
      );
    end if;
    -- Forget stale failures so a lock cannot outlive a quiet spell.
    if th.fail_count = 0 or th.last_fail_at < now_ts - lock_window then
      th.fail_count := 0;
    end if;
  end if;

  -- The name lookup and the password check below are deliberately
  -- indistinguishable from the caller's point of view.
  select id into gid from public.groups where lower(btrim(name)) = rkey;
  if gid is not null then
    select password_hash into sechash from public.room_secrets where room_id = gid;
  end if;

  if gid is null
     or sechash is null
     or p_password is null
     or extensions.crypt(p_password, sechash) is distinct from sechash
  then
    nfails := coalesce(th.fail_count, 0) + 1;
    insert into public.login_throttle (user_id, fail_count, last_fail_at, locked_until, updated_at)
    values (
      uid, nfails, now_ts,
      case when nfails >= max_fails then now_ts + lock_window end,
      now_ts
    )
    on conflict (user_id) do update
      set fail_count   = excluded.fail_count,
          last_fail_at = excluded.last_fail_at,
          locked_until = excluded.locked_until,
          updated_at   = excluded.updated_at;

    return jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  end if;

  if p_display_name is not null and btrim(p_display_name) <> '' then
    myname := btrim(p_display_name);
  else
    select display_name into myname from public.profiles where id = uid;
  end if;

  insert into public.group_members (group_id, user_id, display_name, role, can_edit)
  values (gid, uid, coalesce(myname, ''), 'member', true)
  on conflict (group_id, user_id) do nothing;

  delete from public.login_throttle where user_id = uid;

  return jsonb_build_object('ok', true, 'room_id', gid);
end;
$$;

-- Rotate the password. Admin only.
create or replace function public.set_room_password(p_room_id uuid, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_admin(p_room_id) then
    raise exception 'only a room admin can change the password' using errcode = '42501';
  end if;
  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'room password must be at least 6 characters' using errcode = '22023';
  end if;

  update public.room_secrets
     set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where room_id = p_room_id;

  if not found then
    raise exception 'this room has no password' using errcode = '22023';
  end if;
end;
$$;

-- Switch between شلة and عائلة. Admin only; the column's own check constraint
-- is the authority on allowed values.
create or replace function public.set_room_type(p_room_id uuid, p_room_type text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_admin(p_room_id) then
    raise exception 'only a room admin can change the type' using errcode = '42501';
  end if;
  if p_room_type is null or p_room_type not in ('friends', 'family') then
    raise exception 'room type must be friends or family' using errcode = '22023';
  end if;

  update public.groups set room_type = p_room_type where id = p_room_id;
end;
$$;

-- The name you answer to inside one room. Independent of the account-wide
-- profile name: the same person can be "بابا" in the family room and "شادي"
-- in the friends room.
create or replace function public.set_my_room_name(p_room_id uuid, p_display_name text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  nm text := coalesce(btrim(p_display_name), '');
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if length(nm) < 1 or length(nm) > 40 then
    raise exception 'room name must be between 1 and 40 characters' using errcode = '22023';
  end if;
  if not public.is_member(p_room_id) then
    raise exception 'you are not a member of this room' using errcode = '42501';
  end if;

  update public.group_members
     set display_name = nm
   where group_id = p_room_id and user_id = auth.uid();
end;
$$;

-- Promote or demote a member. Admin only, and a room can never end up with no
-- admin, because the only way out of admin is through here.
create or replace function public.change_member_role(
  p_room_id uuid,
  p_user_id uuid,
  p_role    text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  admins integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_admin(p_room_id) then
    raise exception 'only a room admin can change roles' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('admin', 'member') then
    raise exception 'role must be admin or member' using errcode = '22023';
  end if;

  if p_role = 'member' then
    select count(*) into admins
      from public.group_members
     where group_id = p_room_id and role = 'admin';
    if admins <= 1
       and exists (select 1 from public.group_members
                    where group_id = p_room_id and user_id = p_user_id and role = 'admin') then
      raise exception 'a room must keep at least one admin' using errcode = '42501';
    end if;
  end if;

  update public.group_members
     set role = p_role
   where group_id = p_room_id and user_id = p_user_id;

  if not found then
    raise exception 'member not found' using errcode = '22023';
  end if;
end;
$$;

-- ============================================================================
--  GRANTS — same contract as 0001: the anon key that ships inside the APK
--  can execute nothing here, and only `authenticated` can.
-- ============================================================================

revoke all on function public.create_room(text, text, text, text, text) from public, anon;
revoke all on function public.join_room(text, text, text) from public, anon;
revoke all on function public.set_room_password(uuid, text) from public, anon;
revoke all on function public.set_room_type(uuid, text) from public, anon;
revoke all on function public.set_my_room_name(uuid, text) from public, anon;
revoke all on function public.change_member_role(uuid, uuid, text) from public, anon;

grant execute on function public.create_room(text, text, text, text, text) to authenticated;
grant execute on function public.join_room(text, text, text) to authenticated;
grant execute on function public.set_room_password(uuid, text) to authenticated;
grant execute on function public.set_room_type(uuid, text) to authenticated;
grant execute on function public.set_my_room_name(uuid, text) to authenticated;
grant execute on function public.change_member_role(uuid, uuid, text) to authenticated;
