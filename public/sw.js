// Deploy-stamped cache names: __DEPLOY_VERSION__ is replaced at build time by
// the Vite plugin in vite.config.ts, so every deploy ships a byte-different
// worker that purges all previous caches on activation.
const CACHE_NAME = 'tengah-bus-dashboard-v5-__DEPLOY_VERSION__';
const STATIC_CACHE_NAME = 'tengah-bus-static-assets-v5-__DEPLOY_VERSION__';
// Only purge caches this app owns; leave unrelated origins' caches alone.
const OWNED_CACHE_PREFIX = 'tengah-bus-';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(OWNED_CACHE_PREFIX) &&
                key !== CACHE_NAME &&
                key !== STATIC_CACHE_NAME
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Never cache the worker or manifest — updates must always come from network.
  if (url.pathname === '/sw.js' || url.pathname === '/manifest.json') {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. Network-first for API timings.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. Network-first for the entry point so new hashed bundles are discovered.
  if (url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 4. Cache-first for hashed, immutable Vite assets.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((response) => {
          const copy = response.clone();
          caches.open(STATIC_CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        });
      })
    );
    return;
  }

  // 5. Stale-while-revalidate for non-hashed public assets (icon.svg).
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkFetch = fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
      return cachedResponse || networkFetch;
    })
  );
});
