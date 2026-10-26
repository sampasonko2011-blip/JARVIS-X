const CACHE = 'jarvis-x-hq-shell-v6';
const SHELL = ['./', './index.html', './hq.css', './hq.js', './forge.js', './model-registry.mjs', './mission-control.html', './mission-control.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('jarvis-x-hq-shell-') && key !== CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never turn arbitrary missing routes or backend responses into cached app HTML.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request) || await caches.match('./index.html');
        return cached || Response.error();
      })
    );
    return;
  }

  const shellUrl = new URL('./', self.location.href);
  const allowed = new Set(SHELL.map((asset) => new URL(asset, shellUrl).href));
  if (!allowed.has(url.href)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response.ok || response.type !== 'basic') return response;
        // Complete the cache write before resolving the response. Fire-and-forget
        // cache writes can be interrupted when the browser terminates the worker.
        return caches.open(CACHE)
          .then((cache) => cache.put(request, response.clone()))
          .catch(() => undefined) // Cache quota/storage failure must not break online navigation.
          .then(() => response);
      });
    })
  );
});
