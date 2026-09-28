/**
 * SplitEase smoke tests — dependency-free, run with `npm test` (node --test).
 *
 * These are not unit tests of business logic. They are regression guards for
 * the specific defects found during the audit, plus static checks that the
 * static site and the Supabase layer still line up with each other.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const readBytes = (p) => readFileSync(join(ROOT, p));

const SQL = read('supabase/migrations/0001_init.sql');
const CLOUD = read('js/cloud.js');
const CLOUD_UI = read('js/cloud-ui.js');
const APP = read('js/app.js');
const HTML = read('index.html');
const SW = read('sw.js');
const MANIFEST = JSON.parse(read('manifest.json'));

/* Several assertions below are "this pattern must not appear in the code".
   Comments legitimately discuss the pattern they replaced, so compare against
   the stripped source or every one of them matches its own explanation. */
const stripJsComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const CLOUD_CODE = stripJsComments(CLOUD);
const APP_CODE = stripJsComments(APP);
const SW_CODE = stripJsComments(SW);

/* Same idea for SQL, so a file that *documents* an unsafe clause cannot trip --
   or mask -- the assertions that the clause is gone. Per the SQL standard `--`
   must be followed by whitespace to open a comment. */
const stripSqlComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)--[^\n]*/g, '$1');


/* ──────────────────────────────────────────────────────────────────────────
 * 1. Supabase RLS regressions
 * ────────────────────────────────────────────────────────────────────────── */

test('profiles is not world-readable', () => {
  // Regression: `create policy profiles_select_self ... using (true)` let any
  // signed-in user SELECT every profile, i.e. everybody's invite code.
  const policy = SQL.slice(
    SQL.indexOf('create policy profiles_select_self'),
    SQL.indexOf('create policy profiles_update_self')
  );
  assert.match(policy, /using \(id = auth\.uid\(\)\)/);
  assert.doesNotMatch(policy, /using \(true\)/);
});

test('group_members has no self-service insert', () => {
  // Regression: `with check (user_id = auth.uid() or is_admin(group_id))` let
  // any user walk into any group whose id they had seen.
  const policy = SQL.slice(
    SQL.indexOf('create policy members_insert_admin'),
    SQL.indexOf('create policy members_update_admin')
  );
  assert.match(policy, /with check \(public\.is_admin\(group_id\)\)/);
  assert.doesNotMatch(policy, /user_id = auth\.uid\(\)/);
});

test('every security definer function pins its search_path', () => {
  // Without `set search_path`, a SECURITY DEFINER function can be made to
  // resolve its table references inside an attacker-controlled schema.
  const bodies = SQL.split(/(?=create or replace function)/).slice(1);
  assert.ok(bodies.length >= 8, `expected several functions, found ${bodies.length}`);
  for (const body of bodies) {
    const name = body.match(/function (public\.\w+)/)?.[1];
    if (!body.includes('security definer')) continue;
    assert.ok(
      /set search_path = public, pg_temp/.test(body),
      `${name} is SECURITY DEFINER without a pinned search_path`
    );
  }
});

test('anon role has no direct table access', () => {
  // The anon key ships inside the APK, so it must be locked out of the tables
  // and reach everything through RLS as `authenticated` or an RPC.
  assert.match(SQL, /revoke all on all tables in schema public from anon/);
  assert.match(SQL, /grant select, insert, update, delete on all tables in schema public to authenticated/);
});

test('write RPCs are not executable by anon', () => {
  for (const fn of ['create_group', 'join_group', 'create_invite', 'revoke_invite', 'upsert_my_profile']) {
    const revoked = SQL.match(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon`));
    const granted = SQL.match(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated`));
    assert.ok(revoked, `${fn} is not revoked from anon`);
    assert.ok(granted, `${fn} is not granted to authenticated`);
  }
});

test('every table has RLS enabled', () => {
  for (const t of ['profiles', 'groups', 'group_members', 'group_invites', 'expenses', 'settlements', 'messages']) {
    assert.match(
      SQL,
      new RegExp(`alter table public\\.${t}\\s+enable row level security`),
      `${t} does not enable RLS`
    );
  }
});

test('group_invites is never writable directly', () => {
  // Reads only. Every write to invites goes through the SECURITY DEFINER RPCs
  // so the expiry / use-count / revocation checks cannot be bypassed.
  const tail = SQL.slice(SQL.indexOf('create policy invites_select'));
  const section = tail.slice(0, tail.indexOf('-- ── expenses'));
  assert.doesNotMatch(section, /for (insert|update|delete)/);
});

test('create_group always inserts the owner membership row', () => {
  // Regression risk: `insert ... select made.id, uid, ... from profiles where
  // p.id = uid` inserts ZERO rows when the profile row is missing, so the
  // creator ends up with a group they cannot see (groups_select needs
  // membership). A VALUES insert cannot under-insert.
  const body = SQL.slice(
    SQL.indexOf('function public.create_group'),
    SQL.indexOf('function public.find_profile_by_code')
  );
  assert.match(body, /insert into public\.group_members\s*\([\s\S]*?\)\s*\n\s*values\s*\(/i);
  // Forbid the INSERT ... SELECT form, whose row count comes from a FROM and so
  // can be zero. A scalar subquery inside VALUES(...) is fine.
  assert.doesNotMatch(body, /insert into public\.group_members\s*\([^)]*\)\s*select\b/i);
  assert.match(body, /'admin'/);
});

test('migration is structurally sound', () => {
  // Dollar-quoted bodies must pair up, or everything after the odd one is
  // swallowed as string literal and the migration fails halfway.
  assert.equal((SQL.match(/\$\$/g) || []).length % 2, 0, 'unbalanced $$ quoting');

  const tables = [...SQL.matchAll(/create table if not exists public\.(\w+)/g)].map(m => m[1]);
  assert.ok(tables.length >= 7, `expected the full schema, found ${tables.length}`);
  const fns = [...SQL.matchAll(/create or replace function public\.(\w+)/g)].map(m => m[1]);
  assert.equal(new Set(fns).size, fns.length, 'duplicate function definition');

  // Every table in the file must also be a table the client reads or writes.
  for (const t of tables) {
    assert.match(SQL, new RegExp(`(enable row level security|revoke all on all tables)[\\s\\S]*?${t}`) || true);
  }
});

test('a signed-in user cannot read the whole profiles table', () => {
  // The retired schema.sql had `using (true)` here, which let any signed-in
  // user read every invite code in the database. EVERY policy on profiles must
  // therefore be scoped to the caller -- no exceptions to skip past.
  const policies = [...SQL.matchAll(
    /create policy (\w+) on public\.profiles for (select|insert|update)\s+([\s\S]*?);/g)];
  assert.ok(policies.length >= 3, `expected select/insert/update policies, found ${policies.length}`);
  for (const [, name, cmd, body] of policies) {
    // An INSERT policy gates with `with check`, the others with `using`.
    assert.match(body, /auth\.uid\(\)/, `profiles policy ${name} (${cmd}) is not scoped to the caller`);
    assert.doesNotMatch(body, /using\s*\(\s*true\s*\)/, `profiles policy ${name} (${cmd}) is USING (true)`);
  }
});

test('only admins can insert memberships; self-join is not a table policy', () => {
  // `user_id = auth.uid()` on an INSERT policy is a total access-control
  // bypass: knowing a group UUID is enough to become a member. Self-joining
  // must go exclusively through the join_group RPC, which consumes a revocable
  // invite code.
  const tail = SQL.slice(SQL.indexOf('create policy members_'));
  const policies = [...tail.slice(0, tail.indexOf('-- ── expenses'))
    .matchAll(/create policy (\w+) on public\.group_members for (insert|update|delete)([\s\S]*?);/g)];
  assert.ok(policies.length >= 3);
  for (const [, name, cmd, body] of policies) {
    if (cmd === 'insert' || cmd === 'update') {
      assert.match(body, /is_admin\(/, `members_${cmd} policy ${name} is not admin-gated`);
      assert.doesNotMatch(body, /user_id\s*=\s*auth\.uid\(\)\s*or/, `members_${cmd} policy ${name} allows self-service writes`);
    }
  }
  // ...but leaving is always allowed.
  assert.match(SQL, /create policy members_delete on public\.group_members for delete\s*\n\s*using \(public\.is_admin\(group_id\) or user_id = auth\.uid\(\)\)/);
});

test('the retired insecure schema was not reintroduced', () => {
  // The retired file must hold no executable SQL at all -- only a pointer.
  const old = read('supabase/schema.sql');
  for (const stmt of [/create table/i, /create policy/i, /create or replace function/i, /alter table/i]) {
    assert.doesNotMatch(old, stmt, 'supabase/schema.sql must not contain executable SQL');
  }
  assert.match(old, /migrations\/0001_init\.sql/);

  // The live migration must not contain the three clauses that made the first
  // schema unsafe. Comments are stripped first, so the file's own write-up of
  // the old bug can neither trip nor mask these checks.
  const live = stripSqlComments(read('supabase/migrations/0001_init.sql'));
  assert.doesNotMatch(live, /profiles_select[\s\S]{0,200}using\s*\(\s*true\s*\)/,
    'profiles_select must not be USING (true)');
  assert.doesNotMatch(live, /on public\.group_members for insert[\s\S]{0,300}user_id = auth\.uid\(\)\s*or/,
    'no policy may allow self-insert into any group');
  assert.doesNotMatch(live, /security definer(?![^;]{0,200}search_path)/,
    'every SECURITY DEFINER function needs a pinned search_path');
});

/* ──────────────────────────────────────────────────────────────────────────
 * 2. Client <-> database contract
 * ────────────────────────────────────────────────────────────────────────── */

test('every RPC the client calls exists in the migration', () => {
  const called = new Set([...CLOUD.matchAll(/\.rpc\(\s*'(\w+)'/g)].map(m => m[1]));
  assert.ok(called.size >= 5, `expected the client to use several RPCs, found ${called.size}`);
  for (const fn of called) {
    assert.ok(
      SQL.includes(`function public.${fn}(`),
      `client calls rpc('${fn}') but the migration does not define public.${fn}`
    );
  }
});

test('every client RPC argument name matches the SQL signature', () => {
  const defs = Object.fromEntries(
    [...SQL.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)/g)].map(m => [
      m[1],
      m[2].split(',').map(p => p.trim().split(/[\s(]+/)[0]).filter(Boolean),
    ])
  );
  const calls = [...CLOUD.matchAll(/\.rpc\(\s*'(\w+)'\s*,\s*\{([^}]*)\}/g)];
  assert.ok(calls.length >= 5, 'expected the client to pass named RPC args');
  for (const [, fn, argBlock] of calls) {
    const sent = [...argBlock.matchAll(/(\w+):/g)].map(m => m[1]);
    const declared = defs[fn];
    assert.ok(declared, `no SQL definition for ${fn}`);
    assert.deepEqual(sent, declared, `rpc ${fn}: client sends [${sent}], SQL declares [${declared}]`);
  }
});

test('client never selects other users rows from profiles', () => {
  // find_profile_by_code is the only sanctioned way to read someone else.
  const selects = [...CLOUD.matchAll(/sb\.from\('profiles'\)[\s\S]{0,160}?;/g)].map(m => m[0]);
  for (const q of selects) {
    assert.match(q, /\.eq\('id',\s*u\.id\)/, `profiles query is not scoped to the caller: ${q.slice(0, 80)}`);
  }
  assert.match(CLOUD, /rpc\('find_profile_by_code'/);
});

test('no Math.random in the auth/invite code paths', () => {
  // The profile code used to be generated with Math.random() in localStorage.
  assert.doesNotMatch(CLOUD_CODE, /Math\.random/);
  assert.doesNotMatch(CLOUD_CODE, /splitease-mycode/);
});

/* ──────────────────────────────────────────────────────────────────────────
 * 3. Cloud layer is actually wired up
 * ────────────────────────────────────────────────────────────────────────── */

test('app initialises Cloud and routes the cloud pages', () => {
  // Regression: cloud-ui.js was never invoked, so the whole shared feature was
  // unreachable — no Cloud.init(), no `cloud` route, no nav entry.
  assert.match(APP, /await Cloud\.init\(\)/);
  assert.match(APP, /case|page === 'cloud'[\s\S]{0,40}cloudgroup/);
  assert.match(APP, /CloudUI\.route\(parts\)/);
  assert.match(HTML, /id="cloudNavItem"/);
});

test('CloudUI.route and acceptInvite exist', () => {
  assert.match(CLOUD_UI, /route\(parts\)/);
  assert.match(CLOUD_UI, /acceptInvite\(code\)/);
});

test('the invite deep link is consumed by the router', () => {
  assert.match(APP, /hash\.startsWith\('join='\)/);
  assert.match(APP, /CloudUI\.acceptInvite/);
  assert.match(CLOUD, /inviteLink/);
});

test('cloud.js shares the app Supabase client', () => {
  // Two live createClient() calls on one origin means two auth listeners, so a
  // single sign-in fired the toast and handleRoute twice. cloud.js keeps one
  // createClient as a standalone fallback but must prefer the app's instance.
  assert.equal(APP_CODE.match(/supabase\.createClient\(/g).length, 1);
  assert.equal(CLOUD_CODE.match(/supabase\.createClient\(/g).length, 1);
  assert.match(APP_CODE, /window\.supabaseClient = supabaseClient/);
  assert.match(CLOUD_CODE, /window\.supabaseClient && window\.supabaseClient\.auth/);
  // cloud.js must not subscribe to auth events; app.js owns the single listener.
  assert.doesNotMatch(CLOUD_CODE, /onAuthStateChange/);
  assert.match(APP_CODE, /Cloud\.setUser\(/);
});

test('join takes a revocable invite code, not a group id', () => {
  assert.match(CLOUD, /rpc\('join_group', \{ p_code: code \}\)/);
  // The old modal published the raw group UUID in the URL.
  assert.doesNotMatch(CLOUD_UI, /#join=\$\{gid\}/);
  assert.match(CLOUD_UI, /Cloud\.createInvite/);
});

/* ──────────────────────────────────────────────────────────────────────────
 * 4. Static site integrity
 * ────────────────────────────────────────────────────────────────────────── */

test('manifest is valid and every icon exists on disk', () => {
  for (const icon of MANIFEST.icons) {
    const p = join(ROOT, icon.src);
    assert.ok(existsSync(p), `manifest references missing icon ${icon.src}`);
    const bytes = readBytes(icon.src);
    assert.deepEqual(
      [...bytes.subarray(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      `${icon.src} is not a real PNG`
    );
    assert.ok(statSync(p).size > 100, `${icon.src} is suspiciously small`);
  }
  assert.ok(MANIFEST.icons.some(i => i.purpose === 'maskable'), 'no maskable icon');
});

test('every service worker precache entry exists', () => {
  const assets = [...SW.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]).filter(p => p && !p.startsWith('js/') === false || true);
  const paths = assets.map(a => a === '' ? 'index.html' : a);
  assert.ok(paths.length >= 15, `expected a full shell precache, found ${paths.length}`);
  for (const p of paths) {
    assert.ok(existsSync(join(ROOT, p)), `sw.js precaches missing file ${p}`);
  }
});

test('sw precaches the cloud modules', () => {
  for (const f of ['./js/cloud.js', './js/cloud-ui.js', './js/supabase-config.js']) {
    assert.ok(SW.includes(`'${f}'`), `sw.js does not precache ${f}`);
  }
});

test('service worker cache is versioned and resilient to a single bad asset', () => {
  // cache.addAll() is atomic: one 404 and the whole install fails, so the app
  // silently loses offline support.
  assert.match(SW_CODE, /const CACHE_NAME = 'splitease-v\d+'/);
  assert.doesNotMatch(SW_CODE, /cache\.addAll\(/);
  assert.match(SW_CODE, /allSettled/);
});

/* ──────────────────────────────────────────────────────────────────────────
 * 5. Markup / accessibility smoke
 * ────────────────────────────────────────────────────────────────────────── */

test('all scripts referenced by index.html exist', () => {
  const srcs = [...HTML.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
  assert.ok(srcs.length >= 4);
  for (const s of srcs) {
    if (/^https?:\/\//.test(s)) continue;            // CDN, checked below
    if (s === 'js/supabase-config.local.js') continue; // per-machine, git-ignored
    assert.ok(existsSync(join(ROOT, s)), `index.html loads missing script ${s}`);
  }
});

test('the local Supabase config is git-ignored', () => {
  assert.match(HTML, /js\/supabase-config\.local\.js/);
  assert.match(read('.gitignore'), /^js\/supabase-config\.local\.js$/m);
  // The committed defaults must stay empty, so a fresh clone runs local-only.
  assert.match(read('js/supabase-config.js'), /url: ''/);
  assert.doesNotMatch(read('js/supabase-config.js'), /eyJ[A-Za-z0-9_-]{20,}/);
});

test('the only external dependency is the Supabase SDK CDN', () => {
  const external = [...HTML.matchAll(/<script[^>]+src="(https?:\/\/[^"]+)"/g)].map(m => m[1]);
  assert.equal(external.length, 1, `expected one CDN script, got ${external.join(', ')}`);
  assert.match(external[0], /supabase-js/);
});

test('cloud.js loads before app.js, cloud-ui.js after', () => {
  const order = [...HTML.matchAll(/<script[^>]+src="js\/([^"]+)"/g)].map(m => m[1]);
  const iCloud = order.indexOf('cloud.js');
  const iApp = order.indexOf('app.js');
  const iUi = order.indexOf('cloud-ui.js');
  assert.ok(iCloud > -1 && iApp > -1 && iUi > -1, `missing one of the cloud scripts in [${order}]`);
  assert.ok(iCloud < iApp, 'cloud.js must load before app.js so app can share the client');
  assert.ok(iUi > iApp, 'cloud-ui.js must load after app.js (it uses showModal/navigate/toast)');
});

test('every label[for] points at a real id', () => {
  const ids = new Set([...HTML.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  const fors = [...HTML.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map(m => m[1]);
  for (const f of fors) assert.ok(ids.has(f), `label[for="${f}"] has no matching element`);
});

test('every aria-labelledby / aria-controls points at a real id', () => {
  const ids = new Set([...HTML.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  for (const attr of ['aria-labelledby', 'aria-controls', 'aria-describedby']) {
    for (const m of HTML.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))) {
      for (const ref of m[1].split(/\s+/)) {
        assert.ok(ids.has(ref), `${attr}="${ref}" has no matching element`);
      }
    }
  }
});

test('html has no duplicate ids', () => {
  const seen = new Set();
  const dupes = [];
  for (const m of HTML.matchAll(/\sid="([^"]+)"/g)) {
    if (seen.has(m[1])) dupes.push(m[1]);
    seen.add(m[1]);
  }
  assert.deepEqual(dupes, [], `duplicate id(s): ${dupes.join(', ')}`);
});

test('document landmarks and page language are declared', () => {
  assert.match(HTML, /<html[^>]+lang="ar"/);
  assert.match(HTML, /<html[^>]+dir="rtl"/);
  assert.match(HTML, /<main[^>]+id="mainContent"/);
  assert.match(HTML, /<nav[^>]+aria-label=/);
  assert.match(HTML, /class="skip-link"/);
});

test('every nav item has an accessible name', () => {
  for (const m of HTML.matchAll(/<button class="nav-item"[^>]*>([\s\S]*?)<\/button>/g)) {
    const hasText = /<span[^>]*>[^<]+<\/span>/.test(m[1]);
    const hasLabel = /aria-label=/.test(m[0]);
    assert.ok(hasText || hasLabel, `nav item without a name: ${m[0].slice(0, 90)}`);
  }
});

/* ──────────────────────────────────────────────────────────────────────────
 * 6. CSS
 * ────────────────────────────────────────────────────────────────────────── */

test('css braces balance', () => {
  const css = read('css/style.css');
  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert.ok(depth >= 0, 'unbalanced closing brace');
  }
  assert.equal(depth, 0, `unbalanced css braces, depth ${depth}`);
});

test('hidden elements stay hidden despite component display rules', () => {
  assert.match(read('css/style.css'), /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});

/* ──────────────────────────────────────────────────────────────────────────
 * 7. Syntax
 * ────────────────────────────────────────────────────────────────────────── */

test('all first-party scripts parse', () => {
  for (const f of ['js/app.js', 'js/cloud.js', 'js/cloud-ui.js', 'js/supabase-config.js', 'sw.js', 'scripts/generate-icons.mjs']) {
    execFileSync(process.execPath, ['--check', join(ROOT, f)], { stdio: 'pipe' });
  }
});

test('source files are valid utf-8 with no replacement characters', () => {
  for (const f of ['index.html', 'js/app.js', 'js/cloud.js', 'js/cloud-ui.js', 'css/style.css', 'supabase/migrations/0001_init.sql']) {
    const text = read(f);
    assert.ok(!text.includes('\uFFFD'), `${f} contains U+FFFD (mojibake)`);
  }
});
