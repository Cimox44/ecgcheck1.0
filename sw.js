/* ECGcheck service worker — offline + aggiornamenti */
const VERSION = 'ecgcheck-v1.2.2';
const CORE = [
  './', './index.html', './style.css', './app.js', './criteria.js', './minipdf.js', './ecgpdf.js', './ecgphoto.js', './manifest.json',
  './lib/pdf.min.mjs', './lib/pdf.worker.min.mjs',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(CORE);
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // rete prima (per ricevere subito le revisioni), cache come riserva
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) { const c = await caches.open(VERSION); c.put(req, r.clone()); }
        return r;
      } catch (err) {
        const hit = await caches.match(req, { ignoreSearch: true });
        return hit || caches.match('./index.html');
      }
    })());
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cl => cl.length ? cl[0].focus() : self.clients.openWindow('./index.html#info')));
});
