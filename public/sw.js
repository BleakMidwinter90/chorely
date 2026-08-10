/**
 * chorely's service worker.
 *
 * Deliberately small and hand-written. A generated Workbox bundle would be
 * several times the size and would need configuring anyway, and the caching
 * rules here are simple enough to read in one sitting — which matters, because
 * a service worker that misbehaves is close to impossible to debug from a
 * user's phone.
 *
 * The single most important rule: only GET navigations and static assets are
 * ever touched. Server Actions are POSTs, and a service worker that intercepts
 * or replays those would corrupt the household's data. Everything else falls
 * straight through to the network.
 */

const VERSION = 'v1';
const SHELL_CACHE = `chorely-shell-${VERSION}`;
const ASSET_CACHE = `chorely-assets-${VERSION}`;
const OFFLINE_URL = '/offline';

const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // One failed precache entry must not abort the whole install and leave
      // the app with no worker at all.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('chorely-') && ![SHELL_CACHE, ASSET_CACHE].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Immutable build output: safe to serve from cache first, forever. */
function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.ico'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Anything that mutates state is none of our business.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache another origin's responses, and never touch the API — stale
  // chore data would be worse than an honest failure.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Navigations: always try the network first, because a chore list is only
  // useful when it is current. Cache is a fallback for a dead connection, not
  // a performance trick.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          return (
            offline ??
            new Response('You are offline.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            })
          );
        }),
    );
  }
});

/**
 * Push notifications.
 *
 * The payload is written by the server in `lib/push`. Anything unparseable is
 * still shown rather than dropped, because a silent notification failure is
 * indistinguishable from the reminder never having been sent.
 */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'chorely';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.tag || 'chorely',
      // Replace rather than stack: three reminders about the same bin is how an
      // app gets its notifications switched off.
      renotify: Boolean(payload.tag),
      data: { url: payload.url || '/home' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/home';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an existing window rather than opening a second copy of the app.
      for (const client of clients) {
        if (client.url.includes(target) && 'focus' in client) return client.focus();
      }
      for (const client of clients) {
        if ('navigate' in client && 'focus' in client) {
          return client.navigate(target).then(() => client.focus());
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
