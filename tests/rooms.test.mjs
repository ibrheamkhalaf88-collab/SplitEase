/**
 * SplitEase room tests — dependency-free, run with `npm test` (node --test).
 *
 * These are static guards over supabase/migrations/0002_rooms.sql and the
 * client that calls it. They exist because there is no database available in
 * CI (no Docker, no psql), so the only thing standing between a bad migration
 * and a broken deploy is what the file says. Every assertion below was
 * mutation-tested: flipping the property in the SQL makes the matching test
 * fail.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const RAW = read('supabase/migrations/0002_rooms.sql');
const CLOUD = read('js/cloud.js');
const CLOUD_UI = read('js/cloud-ui.js');

/* Comments legitimately discuss the unsafe clause they replaced, so compare
   against stripped source or the explanation matches its own assertion. */
const stripSqlComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)--[^\n]*/g, '$1');
const stripJsComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const SQL = stripSqlComments(RAW);
const CLOUD_CODE = stripJsComments(CLOUD);
const UI_CODE = stripJsComments(CLOUD_UI);

/** Body of `create or replace function public.<name>(` … up to its closing `$$;` */
function fnBody(name) {
  const start = SQL.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `function ${name} is missing from 0002_rooms.sql`);
  const open = SQL.indexOf('$$', start);
  const end = SQL.indexOf('$$', open + 2);
  assert.notEqual(end, -1, `function ${name} has no body`);
  return SQL.slice(open + 2, end);
}

const ROOM_FNS = [
  'create_room',
  'join_room',
  'set_room_password',
  'set_room_type',
  'set_my_room_name',
  'change_member_role',
];

/* ── the secret table ─────────────────────────────────────────────────────── */

test('room_secrets has row level security and zero policies', () => {
  // A table with RLS on and no policy denies every direct query. That is the
  // whole reason a password hash can live in the same database as the anon
  // key that ships inside the APK.
  assert.match(RAW, /alter table public\.room_secrets enable row level security/);
  const policies = SQL.match(/create policy \w+ on public\.room_secrets/g) || [];
  assert.equal(policies.length, 0, `room_secrets must have no policies, found: ${policies}`);
});

test('room_secrets is revoked from every client role', () => {
  // Supabase hands every *new* table to anon and authenticated through
  // `alter default privileges`, so this revoke is what actually closes it.
  assert.match(SQL, /revoke all on public\.room_secrets from public, anon, authenticated/);
});

test('login_throttle has row level security and is revoked from clients', () => {
  assert.match(RAW, /alter table public\.login_throttle enable row level security/);
  assert.equal((SQL.match(/create policy \w+ on public\.login_throttle/g) || []).length, 0);
  assert.match(SQL, /revoke all on public\.login_throttle from public, anon, authenticated/);
});

test('no table stores a plaintext password', () => {
  // `password_hash` is the only credential column; bcrypt output, never input.
  assert.match(SQL, /password_hash\s+text not null/);
  assert.doesNotMatch(SQL, /\n\s*password\s+text/);
  assert.doesNotMatch(CLOUD_CODE, /from\('room_secrets'\)/);
  assert.doesNotMatch(CLOUD_CODE, /password_hash/);
});

/* ── function hardening ───────────────────────────────────────────────────── */

test('every room function pins its search_path', () => {
  // Without this a user who can create an object in an earlier schema can
  // shadow public.groups and run these functions with elevated privileges.
  for (const name of ROOM_FNS) {
    const head = SQL.slice(
      SQL.indexOf(`create or replace function public.${name}(`),
      SQL.indexOf('$$', SQL.indexOf(`create or replace function public.${name}(`))
    );
    assert.match(head, /security definer/, `${name} must be SECURITY DEFINER`);
    assert.match(head, /set search_path = public, pg_temp/, `${name} must pin search_path`);
  }
});

test('every room function is closed to anon and open to authenticated', () => {
  const signatures = {
    create_room: '(text, text, text, text, text)',
    join_room: '(text, text, text)',
    set_room_password: '(uuid, text)',
    set_room_type: '(uuid, text)',
    set_my_room_name: '(uuid, text)',
    change_member_role: '(uuid, uuid, text)',
  };
  for (const [name, sig] of Object.entries(signatures)) {
    assert.ok(
      SQL.includes(`revoke all on function public.${name}${sig} from public, anon;`),
      `${name} must be revoked from public and anon`
    );
    assert.ok(
      SQL.includes(`grant execute on function public.${name}${sig} to authenticated;`),
      `${name} must be granted to authenticated`
    );
  }
});

test('room passwords are bcrypt-hashed server-side', () => {
  for (const name of ['create_room', 'set_room_password']) {
    const body = fnBody(name);
    assert.match(body, /extensions\.gen_salt\('bf', 10\)/, `${name} must use a bcrypt salt`);
    assert.match(body, /extensions\.crypt\(/, `${name} must hash through crypt()`);
  }
});

test('create_room validates its inputs before writing', () => {
  const body = fnBody('create_room');
  assert.match(body, /length\(p_password\) < 6/);
  assert.match(body, /p_room_type not in \('friends', 'family'\)/);
  assert.match(body, /length\(room\) < 2 or length\(room\) > 60/);
});

test('create_room writes the membership with VALUES, not INSERT ... SELECT', () => {
  // Regression: an INSERT ... SELECT from profiles inserts ZERO rows when the
  // profile is missing, leaving the creator with a room they cannot see.
  const body = fnBody('create_room');
  assert.match(body, /insert into public\.group_members \(group_id, user_id, display_name, role, can_edit\)\s+values/);
  assert.doesNotMatch(body, /insert into public\.group_members[\s\S]*?select/i);
});

/* ── join_room: no enumeration oracle ─────────────────────────────────────── */

test('join_room never raises, so the attempt counter survives', () => {
  const body = fnBody('join_room');
  const start = SQL.indexOf('create or replace function public.join_room(');
  const head = SQL.slice(start, SQL.indexOf('$$', start));
  assert.doesNotMatch(body, /raise exception/, 'join_room must return jsonb, not raise');
  assert.match(head, /returns jsonb/);
});

test('join_room gives one answer for missing room and wrong password', () => {
  // Two literals would be an oracle: an attacker could tell an existing room
  // name from a typo by which message comes back.
  const body = fnBody('join_room');
  const hits = body.match(/invalid_credentials/g) || [];
  assert.equal(hits.length, 1, `expected exactly one invalid_credentials, found ${hits.length}`);
  assert.match(body, /gid is null\s+or sechash is null\s+or p_password is null\s+or extensions\.crypt\(p_password, sechash\) is distinct from sechash/);
});

test('join_room throttles per account, never per room', () => {
  // A per-room counter would be an oracle in itself: hitting it five times
  // would prove the room exists.
  const body = fnBody('join_room');
  assert.match(body, /from public\.login_throttle where user_id = uid/);
  assert.match(body, /too_many_attempts/);

  const table = SQL.slice(
    SQL.indexOf('create table if not exists public.login_throttle'),
    SQL.indexOf('alter table public.login_throttle enable row level security')
  );
  assert.match(table, /user_id\s+uuid primary key/, 'throttle must be keyed on the caller');
  assert.doesNotMatch(table, /room_id|group_id/, 'throttle must not be keyed on a room');
});

test('join_room resets the throttle on success', () => {
  const body = fnBody('join_room');
  assert.match(body, /delete from public\.login_throttle where user_id = uid/);
});

test('join_room writes the member row itself', () => {
  const body = fnBody('join_room');
  assert.match(body, /insert into public\.group_members/);
  assert.match(body, /on conflict \(group_id, user_id\) do nothing/);
  assert.match(body, /'member', true/);
});

/* ── room admin RPCs ──────────────────────────────────────────────────────── */

test('room settings RPCs are admin-only', () => {
  for (const name of ['set_room_password', 'set_room_type', 'change_member_role']) {
    assert.match(fnBody(name), /not public\.is_admin\(p_room_id\)/, `${name} must check is_admin`);
    assert.match(fnBody(name), /42501/);
  }
});

test('set_my_room_name is member-only and scoped to the caller', () => {
  const body = fnBody('set_my_room_name');
  assert.match(body, /not public\.is_member\(p_room_id\)/);
  assert.match(body, /where group_id = p_room_id and user_id = auth\.uid\(\)/);
});

test('a room can never lose its last admin', () => {
  const body = fnBody('change_member_role');
  assert.match(body, /keep at least one admin/);
  assert.match(body, /role = 'admin'\)/);
});

test('room_type is a closed set on the column too', () => {
  // The RPC validates, but the constraint is what survives a future RPC.
  assert.match(SQL, /add column if not exists room_type text not null default 'friends'\s+check \(room_type in \('friends', 'family'\)\)/);
});

test('room names are a unique, case-insensitive join key', () => {
  assert.match(SQL, /create unique index if not exists idx_groups_name_lower\s+on public\.groups \(lower\(btrim\(name\)\)\)/);
});

/* ── client ───────────────────────────────────────────────────────────────── */

test('client exposes every room RPC and reads nothing it should not', () => {
  for (const rpc of ['create_room', 'join_room', 'set_room_password', 'set_room_type', 'set_my_room_name', 'change_member_role']) {
    assert.ok(CLOUD_CODE.includes(`rpc('${rpc}'`), `cloud.js must call ${rpc}`);
  }
  assert.doesNotMatch(CLOUD_CODE, /from\('room_secrets'\)/);
  assert.doesNotMatch(CLOUD_CODE, /from\('login_throttle'\)/);
  assert.doesNotMatch(UI_CODE, /password_hash/);
});

test('join_room failures surface as one client message', () => {
  // The server sends only `invalid_credentials` for both failure modes, so the
  // client must not branch on the room name either.
  assert.match(CLOUD_CODE, /case 'invalid_credentials':/);
  assert.doesNotMatch(CLOUD_CODE, /room not found/i);
});

test('the join form sends a display name the member chose', () => {
  assert.match(UI_CODE, /CloudUI\.join\(\)/);
  assert.match(CLOUD_CODE, /p_display_name: displayName/);
  assert.match(UI_CODE, /Cloud\.setMyRoomName\(/);
});
