/* PDF 页面提取器 - Service Worker：离线缓存核心资源 */
const CACHE = 'pdf-extractor-v1.0.0';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './lib/pdf.min.js',
  './lib/pdf-lib.min.js',
  './lib/jszip.min.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request))
  );
});
