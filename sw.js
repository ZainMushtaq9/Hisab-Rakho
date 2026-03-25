// sw.js - Hisab Rakho Service Worker — Full Offline-First PWA

const CACHE_VERSION = 'v20';
const STATIC_CACHE = 'hisab-rakho-static-' + CACHE_VERSION;
const DYNAMIC_CACHE = 'hisab-rakho-dynamic-' + CACHE_VERSION;

// All app pages and core assets to pre-cache
const APP_SHELL = [
  './',
  './manifest.json',
  './assets/js/firebase-config.js',
  './assets/js/utils.js',
  './assets/js/data-service.js',
  // Auth Pages
  './splash.html',
  './login.html',
  './signup.html',
  './verify-email.html',
  './forgot-password.html',
  './setup.html',
  // Main Pages
  './dashboard.html',
  './pos.html',
  './inventory.html',
  './inventory-add.html',
  './inventory-edit.html',
  './customers.html',
  './customer-detail.html',
  './bills.html',
  './bill-detail.html',
  './reports.html',
  './whatsapp-batch.html',
  './customer-dashboard.html',
  './customer-shops.html',
  './bill-edit.html',
  // Finance Pages
  './suppliers.html',
  './expenses.html',
  './daily-cash.html',
  './returns.html',
  // Settings
  './settings.html',
  './subscription.html'
];

// External resources to cache on first use
const EXTERNAL_WHITELIST = [
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

// ── INSTALL: Pre-cache all app shell ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE: Clean old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key !== STATIC_CACHE && key !== DYNAMIC_CACHE) {
          console.log('[SW] Removing old cache:', key);
          return caches.delete(key);
        }
      }))
    )
  );
  return self.clients.claim();
});

// ── FETCH: Offline-first strategy ──
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip: Firebase SDK, Firestore API, Analytics (these have their own offline handling)
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('gstatic.com') ||
      url.hostname.includes('google-analytics.com') ||
      url.hostname.includes('firebaseinstallations') ||
      url.hostname.includes('identitytoolkit')) {
    return;
  }

  // HTML pages: Network-first, cache fallback
  if (req.headers.get('accept') && req.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(req).then(res => {
        const clone = res.clone();
        caches.open(DYNAMIC_CACHE).then(cache => cache.put(req, clone));
        return res;
      }).catch(() => {
        return caches.match(req).then(cached => {
          if (cached) return cached;
          // Try the static cache (for pre-cached pages)
          return caches.match(req, { cacheName: STATIC_CACHE }).then(staticCached => {
            return staticCached || caches.match('./dashboard.html');
          });
        });
      })
    );
    return;
  }

  // External fonts: Cache-first
  if (EXTERNAL_WHITELIST.some(host => url.hostname.includes(host))) {
    event.respondWith(
      caches.match(req).then(cached => {
        return cached || fetch(req).then(res => {
          const clone = res.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(req, clone));
          return res;
        }).catch(() => new Response('', { status: 408 }));
      })
    );
    return;
  }

  // JS, CSS, Images: Cache-first, network fallback
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        // Only cache successful responses
        if (res.status === 200) {
          const clone = res.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(req, clone));
        }
        return res;
      }).catch(() => {
        // Return empty response for non-critical assets
        if (req.url.match(/\.(png|jpg|jpeg|svg|gif|webp)$/)) {
          return new Response('', { headers: { 'Content-Type': 'image/svg+xml' } });
        }
        return new Response('', { status: 408 });
      });
    })
  );
});

// ── BACKGROUND SYNC: Re-try failed ops when back online ──
self.addEventListener('sync', event => {
  if (event.tag === 'hisab-rakho-sync') {
    console.log('[SW] Background sync triggered');
    // Firebase handles its own sync, but we notify the UI
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SYNC_TRIGGERED' });
        });
      })
    );
  }
});

// ── MESSAGE: Listen for skip-waiting from update prompt ──
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
