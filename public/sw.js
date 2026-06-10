const CACHE_NAME = "nexfinance-pwa-v4";
const APP_SHELL = [
  "/",
  "/login.html",
  "/cadastro.html",
  "/dashboard.html",
  "/esqueci.html",
  "/perfil-investidor.html",
  "/offline.html",
  "/login.css",
  "/styles.css",
  "/perfil-investidor.css",
  "/login.js",
  "/cadastro.js",
  "/recuperar.js",
  "/perfil-investidor.js",
  "/app.js",
  "/pwa.js",
  "/manifest.webmanifest",
  "/img/LOGO-NEX.png.png",
  "/img/Mascote-png.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (request.method !== "GET" || url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  if (["/app.js", "/styles.css", "/login.css", "/perfil-investidor.css", "/pwa.js", "/manifest.webmanifest"].includes(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/offline.html"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    })),
  );
});
