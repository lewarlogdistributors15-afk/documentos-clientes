const CACHE = "lewar-expo-20261003-emailretry";
const CORE = [
  "./",
  "./index.html",
  "./admin-ordenes.html",
  "./ordenes.html",
  "./pedido-recibido.html",
  "./app.js",
  "./catalogo.json",
  "./fotos-catalogo.js",
  "./pricing.js",
  "./orders.js",
  "./order-pdf.js",
  "./record-client.js",
  "./vendor/pdf-lib.min.js",
  "./lewar-logo.png",
  "./invitacion-expo-muebles.jpeg",
  "./manifest.webmanifest",
  "./app-icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then(response => response || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
    )
  );
});