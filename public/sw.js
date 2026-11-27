const CACHE_NAME = 'cryptopulse-shell-v2';

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

const NEVER_CACHE_HOSTS = [
  'binance.vision',
  'binance.com',
  'coingecko.com',
  'alternative.me',
  'gateio.ws',
  'bitget.com',
  'hyperliquid.xyz',
  'okx.com',
  'telegram.org',
  'api.github.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Never intercept or cache live exchange / sync / Telegram APIs
  if (NEVER_CACHE_HOSTS.some((host) => url.hostname.endsWith(host))) {
    return;
  }

  // Only handle same-origin static app shell requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network-first strategy: always deliver fresh builds when online, fall back to cache offline
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => undefined);
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match('./index.html')),
      ),
  );
});
