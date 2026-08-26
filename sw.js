const CACHE = 'lawncraft-v8';

const PRECACHE_URLS = [
  '/',
  '/styles.css',
  '/script.js',
  '/auth.js',
  '/manifest.json',
  '/assets/images/icon-192.png',
  '/assets/images/icon-512.png',
  '/offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Non-GET requests (POST, PUT, DELETE, etc.) cannot be cached in Cache API.
  // Pass them directly to the network.
  if (request.method !== 'GET') {
    event.respondWith(handleNonGetRequest(request));
    return;
  }

  const url = new URL(request.url);

  // API calls & scripts/styles/navigation — network first, fall back to cache
  if (
    url.pathname.startsWith('/api/') ||
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.mode === 'navigate'
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets (images, fonts, etc.) — cache first
  event.respondWith(cacheFirst(request));
});

async function handleNonGetRequest(request) {
  try {
    return await fetch(request);
  } catch (error) {
    // If the network request fails (e.g. device is offline), return a descriptive JSON error response
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          message: 'Unable to connect to the server. Please check your internet connection and try again.',
          code: 'OFFLINE_NETWORK_ERROR',
        },
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      return caches.match('/offline.html');
    }
    return new Response('Offline', { status: 503 });
  }
}

