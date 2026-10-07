// Service Worker for Maintenance Stock System PWA
const CACHE_NAME = 'maint-stock-v1.0.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png',
  '/icons/icon.svg',
  '/icons/favicon.svg'
];

// Install: Cache essential assets & take over immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Cache addAll warning (non-fatal):', err);
      });
    })
  );
});

// Activate: Clean up previous cache versions & claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Smart network-first for API/SSE vs stale-while-revalidate for static files
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Never intercept non-GET requests (e.g. POST, PUT, DELETE)
  if (req.method !== 'GET') {
    return;
  }

  // 2. Never intercept Server-Sent Events or active streaming endpoints
  if (url.pathname.startsWith('/api/events')) {
    return;
  }

  // 3. For API data endpoints: Network-first, fallback to cache if offline
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          // If successful GET api response, clone to cache for offline viewing
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(() => {
          return caches.match(req);
        })
    );
    return;
  }

  // 4. For HTML, JS, CSS, CDN icons, and images: Network-first with cache fallback
  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return networkRes;
      })
      .catch(() => {
        return caches.match(req).then((cachedRes) => {
          if (cachedRes) return cachedRes;
          // Fallback to root index.html for navigation requests
          if (req.mode === 'navigate') {
            return caches.match('/index.html') || caches.match('/');
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
      })
  );
});
