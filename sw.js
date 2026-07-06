/* Forja · service worker */
const CACHE = 'forja-shell-v2';
const IMGCACHE = 'forja-img-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'catalog.json', 'manifest.webmanifest', 'icons/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== IMGCACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Imágenes de ejercicios (jsDelivr): cache-first, se guardan al verlas -> offline en el gym
  if (url.hostname.indexOf('jsdelivr.net') !== -1) {
    e.respondWith(caches.open(IMGCACHE).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res && res.status === 200) c.put(req, res.clone()); return res; }
      catch (err) { return hit || new Response('', { status: 504 }); }
    }));
    return;
  }

  // App (mismo origen): cache-first, actualiza en segundo plano, con fallback offline
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.status === 200) { const cl = res.clone(); caches.open(CACHE).then(c => c.put(req, cl)); }
        return res;
      }).catch(() => hit || caches.match('index.html'));
      return hit || net;
    }));
  }
});
