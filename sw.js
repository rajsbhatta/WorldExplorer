/* ============================================================
   World Explorer — Service Worker
   Cache-first for app shell, network-first for API data
   ============================================================ */

const CACHE_VERSION = 'v1.0.0';
const SHELL_CACHE   = `worldex-shell-${CACHE_VERSION}`;
const DATA_CACHE    = `worldex-data-${CACHE_VERSION}`;
const IMG_CACHE     = `worldex-img-${CACHE_VERSION}`;

/* App shell files — cached on install */
const SHELL_FILES = [
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/api.js',
  './js/countries.js',
  './js/detail.js',
  './js/compare.js',
  './js/games.js',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap'
];

/* API origins we handle */
const API_ORIGINS = [
  'restcountries.com',
  'api.worldbank.org',
  'query.wikidata.org',
  'geoapi.info',
  'flagcdn.com',
  'upload.wikimedia.org'
];

const isApiRequest = url =>
  API_ORIGINS.some(origin => url.includes(origin));

const isFlagImage = url =>
  url.includes('flagcdn.com') || (url.includes('wikimedia') && url.includes('Flag'));

/* ── Install ─────────────────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
      .catch(err => {
        console.warn('[SW] Shell pre-cache partial failure:', err);
        return self.skipWaiting();
      })
  );
});

/* ── Activate — clean old caches ─────────────────────────── */
self.addEventListener('activate', event => {
  const currentCaches = [SHELL_CACHE, DATA_CACHE, IMG_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => !currentCaches.includes(key))
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ── Fetch strategy ──────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = request.url;

  /* Skip non-GET and chrome-extension */
  if (request.method !== 'GET') return;
  if (url.startsWith('chrome-extension')) return;

  /* Flag images — cache-first, long TTL */
  if (isFlagImage(url)) {
    event.respondWith(cacheFirst(request, IMG_CACHE));
    return;
  }

  /* API data — stale-while-revalidate */
  if (isApiRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  /* App shell — cache-first */
  event.respondWith(cacheFirst(request, SHELL_CACHE));
});

/* ── Strategies ──────────────────────────────────────────── */

/** Cache-first: serve from cache, fall back to network */
async function cacheFirst(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Offline — resource unavailable', { status: 503 });
  }
}

/** Stale-while-revalidate: serve cache immediately, refresh in background */
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then(response => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || networkFetch || new Response(
    JSON.stringify({ error: 'offline', message: 'No cached data available' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );
}

/* ── Message handler — manual cache clear from app ──────── */
self.addEventListener('message', event => {
  if (event.data?.type === 'CLEAR_DATA_CACHE') {
    caches.delete(DATA_CACHE).then(() => {
      event.ports[0]?.postMessage({ success: true });
    });
  }

  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: CACHE_VERSION });
  }
});

/* ── Background sync — queue failed API requests ────────── */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-favourites') {
    /* No server sync needed — all local — placeholder for future */
    event.waitUntil(Promise.resolve());
  }
});
