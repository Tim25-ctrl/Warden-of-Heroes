// Service worker (GDD 8.7) : le jeu s'installe et se joue hors ligne.
// Stratégie (v1.1) :
// - la page elle-même passe d'abord par le réseau, en revalidant le cache du navigateur, pour qu'une nouvelle
//   version s'affiche dès l'ouverture suivante ; sans réseau, on sert la dernière copie enregistrée ;
// - les fichiers du jeu (leur nom change à chaque version) sont servis depuis le cache, puis rafraîchis.
const CACHE = 'warden-of-heroes-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        fetch(req, { cache: 'no-cache' })
          .then((res) => { if (res.ok) cache.put('./index.html', res.clone()); return res; })
          .catch(async () => (await cache.match('./index.html')) ?? (await cache.match('./')) ?? Response.error()),
      ),
    );
    return;
  }
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    }),
  );
});

// Un clic sur une notification ramène le joueur dans le jeu.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./');
    }),
  );
});
