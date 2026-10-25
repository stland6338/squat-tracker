const VER = 'squat-v1';
const APP = ['./', 'index.html', 'style.css', 'app.js', 'logic.js', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VER).then((c) => c.addAll(APP))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const cdn = /cdn\.jsdelivr\.net|storage\.googleapis\.com/.test(u.host);
  if (u.origin !== location.origin && !cdn) return;
  // アプリ本体：ネット優先・失敗時キャッシュ。CDN（MediaPipe）：キャッシュ優先。
  e.respondWith(cdn
    ? caches.match(e.request).then((r) => r || fetch(e.request).then((res) => { if (res.ok) { const cl = res.clone(); caches.open(VER).then((c) => c.put(e.request, cl)); } return res; }))
    : fetch(e.request).then((res) => { const cl = res.clone(); caches.open(VER).then((c) => c.put(e.request, cl)); return res; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
