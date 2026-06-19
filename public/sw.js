const CACHE_NAME = 'tengah-bus-dashboard-v3';
const STATIC_CACHE_NAME = 'tengah-bus-static-assets-v3';

// Install Event
self.addEventListener('install', (event) => {
  // Force the waiting service worker to become active immediately
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== STATIC_CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => {
      // Take control of all pages immediately so they don't have to reload
      return self.clients.claim();
    })
  );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. NEVER cache sw.js or manifest.json (always bypass cache to prevent lock-in)
  if (url.pathname === '/sw.js' || url.pathname === '/manifest.json') {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. Network-first for API timings
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. Network-first for the entry point (index.html)
  // This ensures the browser always gets the latest HTML which points to the new hashed JS files.
  // Falls back to cache only when offline.
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

  // 4. Cache-first for compiled assets (Vite hashed JS/CSS are immutable)
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

  // 5. Stale-While-Revalidate for non-hashed public assets (like icon.svg)
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
