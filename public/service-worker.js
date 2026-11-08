const CACHE_NAME = "factpedia-pwa-v5";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = ["/", OFFLINE_URL, "/search-index.json", "/favicon.svg", "/manifest.webmanifest"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS).catch(() => cache.addAll(["/", OFFLINE_URL])))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith("factpedia-pwa-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function updateCache(request, response) {
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === "navigate";
  const isStaticAsset = ["style", "script", "image", "font"].includes(request.destination) ||
    url.pathname === "/search-index.json" ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.endsWith(".svg");

  if (!isNavigation && !isStaticAsset) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    const refresh = fetch(request)
      .then(response => updateCache(request, response))
      .catch(() => null);

    if (cached) {
      event.waitUntil(refresh);
      return cached;
    }

    const fresh = await refresh;
    if (fresh) return fresh;
    if (isNavigation) return (await caches.match(OFFLINE_URL)) || Response.error();
    return Response.error();
  })());
});
