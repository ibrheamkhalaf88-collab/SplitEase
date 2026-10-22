/* ============================================================
   SplitEase service worker
   ------------------------------------------------------------
   Offline-first shell cache. The app is small and fully local
   (IndexedDB), so we precache the whole shell.
   Push notifications via Web Push API (VAPID).
   ============================================================ */
const CACHE_NAME = 'splitease-v11';

/* VAPID public key — base64url encoded, no padding.
   Generate with: npx web-push generate-vapid-keys
   Store the private key in Supabase Edge Function env (VAPID_PRIVATE_KEY).
   VAPID_SUBJECT example: "mailto:admin@splitease.app" */
const VAPID_PUBLIC_KEY = 'BHgbrA4mKkxoCW_US7RtsTGQ_ZAXPGL8pbG0TJ1-Jm2jM5e09LZiaB6_Pmt93rnsTAzs48jQ8LjSCmUa2FnexKE';

/* Supabase config — filled at runtime from js/supabase-config.js */
let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';

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
  './js/onboarding.js',
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

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeToPush() {
  try {
    if (!SUPABASE_URL) return;
    const registration = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    /* Send subscription to Supabase Edge Function */
    await fetch(`${SUPABASE_URL}/functions/v1/push-subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(registration.toJSON()),
    });
    console.log('[sw] Push subscribed');
  } catch (e) {
    console.warn('[sw] Push subscribe failed:', e);
  }
}

async function unsubscribeFromPush() {
  try {
    const subscription = await self.registration.pushManager.getSubscription();
    if (subscription && SUPABASE_URL) {
      await subscription.unsubscribe();
      await fetch(`${SUPABASE_URL}/functions/v1/push-subscribe`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      console.log('[sw] Push unsubscribed');
    }
  } catch (e) {
    console.warn('[sw] Push unsubscribe failed:', e);
  }
}

/* Initialize Supabase config from main thread */
function initSupabaseConfig() {
  try {
    if (window.SUPABASE_CONFIG) {
      SUPABASE_URL = window.SUPABASE_CONFIG.url;
      SUPABASE_ANON_KEY = window.SUPABASE_CONFIG.anonKey;
    }
  } catch (e) { /* ignore */ }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
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

/* ── Push Notifications ── */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }

  const title = payload.title || 'SplitEase';
  const options = {
    body: payload.body || '',
    icon: payload.icon || './icons/icon-192.png',
    badge: payload.badge || './icons/icon-72.png',
    tag: payload.tag || 'splitease-notification',
    data: payload.data || {},
    requireInteraction: payload.requireInteraction || false,
    actions: payload.actions || [],
    dir: 'rtl',
    lang: 'ar',
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let targetUrl = './';

  if (data.groupId) {
    targetUrl = './#cloudgroup/' + data.groupId;
  } else if (data.type === 'chat') {
    targetUrl = './#cloud';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  } else if (event.data?.type === 'subscribePush') {
    initSupabaseConfig();
    subscribeToPush();
  } else if (event.data?.type === 'unsubscribePush') {
    initSupabaseConfig();
    unsubscribeFromPush();
  } else if (event.data?.type === 'initSupabase') {
    SUPABASE_URL = event.data.url;
    SUPABASE_ANON_KEY = event.data.anonKey;
  }
});