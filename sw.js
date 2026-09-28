/* ============================================================
   SplitEase service worker
   ------------------------------------------------------------
   Offline-first shell cache. The app is small and fully local
   (IndexedDB), so we precache the whole shell.
   ============================================================ */
const CACHE_NAME = 'splitease-v3';

/* Local shell. `js/supabase-config.js` is included on purpose: it is tiny
   and the app must boot into a sane state with no network. */
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/cloud.js',
  './js/cloud-ui.js',
  './js/supabase-config.js',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
];

/* Paths that must always hit the network and must never be served from cache. */
const NETWORK_ONLY = [/^\/api\//];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      /* Deliberately NOT cache.addAll(): addAll() is atomic, so a single 404
         or transient network error aborts the entire install and the PWA
         silently never activates — that is exactly the bug this replaced.
         Cache each entry independently and log whatever could not be fetched. */
      const results = await Promise.allSettled(
        ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' }))),
      );
      const failed = ASSETS.filter((_, i) => results[i].status === 'rejected');
      if (failed.length) console.warn('[sw] precache skipped:', failed);
    }).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k.startsWith('splitease-'))
          .map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;      // CDN / Supabase pass through
  if (NETWORK_ONLY.some((re) => re.test(url.pathname))) return;

  /* Navigations: serve the cached shell immediately so a cold offline launch
     still renders, and refresh it in the background so new deploys land. */
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', clone));
            }
            return response;
          })
          .catch(() => cached || caches.match('./index.html'));
        return cached || network;
      }),
    );
    return;
  }

  /* Everything else: stale-while-revalidate. */
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
