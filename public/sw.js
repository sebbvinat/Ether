// Minimal service worker — required for PWA installability on some browsers.
// We don't cache anything aggressively (data is realtime), just pass through.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Pass-through. No caching strategy — let the network handle it.
});
