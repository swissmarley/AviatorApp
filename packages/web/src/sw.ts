/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(({ url }) => url.pathname.startsWith('/api/airports') || url.pathname.startsWith('/api/layers') || url.pathname.startsWith('/api/meta'), new StaleWhileRevalidate({ cacheName: 'api-static', plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 24 * 3600 })] }));
registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkFirst({ cacheName: 'api-live', networkTimeoutSeconds: 8, plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 600 })] }));
registerRoute(({ url }) => /basemaps\.cartocdn\.com|tile\.opentopomap\.org|arcgisonline\.com|api\.maptiler\.com/.test(url.host), new CacheFirst({ cacheName: 'tiles', plugins: [new ExpirationPlugin({ maxEntries: 1500, maxAgeSeconds: 7 * 24 * 3600 })] }));
registerRoute(({ url }) => url.pathname.startsWith('/cesium/'), new CacheFirst({ cacheName: 'cesium', plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 })] }));

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {};
  try { data = event.data?.json() ?? {}; } catch { data = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title ?? 'Contrail', { body: data.body, tag: data.tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: data.url ?? '/' } }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const c of clients) if ('focus' in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});

self.addEventListener('message', (event) => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
