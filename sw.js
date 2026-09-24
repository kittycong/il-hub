// IL 허브 오프라인 캐시: 네트워크 우선, 실패하면 저장본
const C = 'il-hub-v4';
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(['./', './index.html', './manifest.webmanifest', './icon.svg']))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const mine = u.origin === location.origin && u.pathname.startsWith(new URL('./', location).pathname);
  const lib = u.hostname === 'cdnjs.cloudflare.com' || u.hostname.endsWith('fonts.gstatic.com') || u.hostname === 'fonts.googleapis.com';
  if (!mine && !lib) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
