/* Forja · service worker */
const CACHE = 'forja-shell-v3';
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

function fromCache(req) { return caches.match(req).then(hit => hit || caches.match('index.html')); }

// Red primero (con fallback a caché): el shell se actualiza solo cuando hay conexión, y funciona offline.
function networkFirst(req) {
  return new Promise(resolve => {
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; fromCache(req).then(resolve); } }, 3500);
    fetch(req).then(res => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (res && res.status === 200) { const cl = res.clone(); caches.open(CACHE).then(c => c.put(req, cl)); }
      resolve(res);
    }).catch(() => { if (settled) return; settled = true; clearTimeout(timer); fromCache(req).then(resolve); });
  });
}

// Caché primero: para archivos grandes y estables (catálogo) e imágenes.
function cacheFirst(req, cacheName) {
  return caches.open(cacheName).then(async c => {
    const hit = await c.match(req);
    if (hit) return hit;
    try { const res = await fetch(req); if (res && res.status === 200) c.put(req, res.clone()); return res; }
    catch (e) { return hit || new Response('', { status: 504 }); }
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Imágenes de ejercicios (jsDelivr): caché primero -> quedan offline en el gym
  if (url.hostname.indexOf('jsdelivr.net') !== -1) { e.respondWith(cacheFirst(req, IMGCACHE)); return; }

  if (url.origin === location.origin) {
    // Catálogo (1 MB, casi nunca cambia): caché primero
    if (url.pathname.endsWith('catalog.json')) { e.respondWith(cacheFirst(req, CACHE)); return; }
    // Resto del shell (html/css/js/iconos): red primero -> actualizaciones al momento
    e.respondWith(networkFirst(req));
  }
});
