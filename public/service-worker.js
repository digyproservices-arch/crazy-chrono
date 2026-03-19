/* ============================================
   Crazy Chrono — Service Worker (PWA)
   Cache-first pour les assets statiques,
   Network-first pour les API
   ============================================ */

const CACHE_NAME = 'crazy-chrono-v4';

// Assets à pré-cacher au moment de l'installation
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/favicon-32.png',
  '/images/logo192.png',
  '/images/logo512.png',
  '/images/apple-touch-icon.png',
  '/images/carte-svg.svg',
];

// Installation : pré-cache des assets essentiels
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Pre-cache partial failure:', err);
      });
    })
  );
  // Activer immédiatement sans attendre la fermeture des onglets
  self.skipWaiting();
});

// Activation : nettoyer les anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  // Prendre le contrôle de tous les clients immédiatement
  self.clients.claim();
});

// Stratégie de fetch
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ne pas intercepter les requêtes non-GET
  if (event.request.method !== 'GET') return;

  // Ne pas intercepter les WebSockets
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

  // Ne pas intercepter les appels API backend (network-only)
  if (url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/socket.io/') ||
      url.hostname !== self.location.hostname) {
    return;
  }

  // Pour les requêtes de navigation (HTML), toujours servir index.html (SPA)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Pour les fichiers de données (JSON) : Network-first, fallback cache
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Pour les assets statiques : Cache-first, fallback network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Ne pas cacher les réponses non-ok ou les réponses opaque
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        // Mettre en cache dynamiquement les assets chargés
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      });
    })
  );
});
