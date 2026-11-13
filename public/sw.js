// Minimal service worker: lets the app install on a phone and open instantly. Data always comes live from the network.
const CACHE = 'myplanner-shell-v1'
self.addEventListener('install', e => { self.skipWaiting() })
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())) })
self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => new Response('<meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;text-align:center;padding:48px">You are offline. Reconnect to open myPlanner.</body>', { headers: { 'Content-Type': 'text/html' } })))
  }
})
