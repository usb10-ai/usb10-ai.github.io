/* Offline cache for the installed web app: serve from cache, refresh in the background */
const CACHE = 'office-editor-v1';
const FILES = ['./', 'index.html', 'app.css', 'common.js', 'word.js', 'ppt.js', 'main.js', 'blank.pptx',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'vendor/jszip.min.js', 'vendor/mammoth.browser.min.js', 'vendor/docx.min.js'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  if (/\.apk$/.test(e.request.url)) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
