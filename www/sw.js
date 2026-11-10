// Service worker «Поправки»: хранит приложение в телефоне, чтобы оно работало без интернета.
const CACHE = 'popravka-120fc0f0a0';
const ASSETS = [
 "./",
 "./capacitor.js",
 "./fonts/fira-sans-extra-condensed-cyrillic-500-normal.woff2",
 "./fonts/fira-sans-extra-condensed-cyrillic-600-normal.woff2",
 "./fonts/fira-sans-extra-condensed-cyrillic-700-normal.woff2",
 "./fonts/fira-sans-extra-condensed-cyrillic-ext-500-normal.woff2",
 "./fonts/fira-sans-extra-condensed-cyrillic-ext-600-normal.woff2",
 "./fonts/fira-sans-extra-condensed-cyrillic-ext-700-normal.woff2",
 "./fonts/fira-sans-extra-condensed-latin-500-normal.woff2",
 "./fonts/fira-sans-extra-condensed-latin-600-normal.woff2",
 "./fonts/fira-sans-extra-condensed-latin-700-normal.woff2",
 "./fonts/fonts.css",
 "./fonts/golos-text-cyrillic-400-normal.woff2",
 "./fonts/golos-text-cyrillic-500-normal.woff2",
 "./fonts/golos-text-cyrillic-600-normal.woff2",
 "./fonts/golos-text-cyrillic-ext-400-normal.woff2",
 "./fonts/golos-text-cyrillic-ext-500-normal.woff2",
 "./fonts/golos-text-cyrillic-ext-600-normal.woff2",
 "./fonts/golos-text-latin-400-normal.woff2",
 "./fonts/golos-text-latin-500-normal.woff2",
 "./fonts/golos-text-latin-600-normal.woff2",
 "./icons/apple-touch-icon.png",
 "./icons/favicon-32.png",
 "./icons/icon-192.png",
 "./icons/icon-512.png",
 "./icons/maskable-512.png",
 "./index.html",
 "./manifest.webmanifest",
 "./version.json"
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('popravka-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit ||
      fetch(e.request).catch(() => e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
  );
});
