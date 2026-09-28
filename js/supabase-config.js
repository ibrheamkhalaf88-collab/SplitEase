/* SplitEase — Supabase configuration (committed defaults, no secrets).
 *
 * To point the app at your own project, create js/supabase-config.local.js
 * (it is git-ignored) with:
 *
 *   window.SUPABASE_CONFIG = {
 *     url: 'https://YOUR_PROJECT_REF.supabase.co',
 *     anonKey: 'YOUR_ANON_PUBLIC_KEY'
 *   };
 *
 * It is loaded after this file, so it overrides these defaults. The anon key is
 * public by design — RLS in supabase/migrations/0001_init.sql is the only thing
 * standing between it and the data, which is why anon is revoked from every
 * table there. Never put a service_role key in either file.
 */
window.SUPABASE_CONFIG = { url: '', anonKey: '' };
