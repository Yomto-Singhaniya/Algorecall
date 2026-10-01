self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    let response;
    try {
      response = await fetch(request);
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const offlinePage = await caches.match(new URL('/', self.location.origin).href);
        if (offlinePage) return offlinePage;
      }
      return Response.error();
    }
    if (response.ok) {
      void caches.open('algorecall-v1')
        .then((cache) => cache.put(request, response.clone()))
        .catch((error) => console.warn('AlgoRecall could not update its offline cache.', error));
    }
    return response;
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => 'focus' in client);
      return existing ? existing.focus() : self.clients.openWindow('/');
    }),
  );
});
