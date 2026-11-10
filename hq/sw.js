const CACHE = 'jarvis-x-hq-shell-v15';
const SHELL = ['./', './index.html', './hq.css', './hq.js', './neural-observatory.css', './neural-observatory.js', './conversation-experience.css', './conversation-experience.js', './arrival-experience.css', './arrival-experience.js', './mission-control.html', './mission-control.js', './forge.js', './manifest.webmanifest' , './icon.svg', './local-chat-preflight.html', './local-chat-preflight.js', './local-chat.html', './local-chat-engine.bundle.js'];

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
        // Serve only the exact requested page from cache. Falling back to index.html
        // makes missing/offline routes look like successful redirects to HQ and
        // hides the actual navigation failure (notably for Local Chat).
        const cached = await caches.match(request);
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
