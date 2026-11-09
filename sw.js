// Network-first for the app's own files (so updates show up immediately), cache fallback when offline.
const CACHE = "parlons-v6";
const CORE = ["./", "index.html", "styles.css?v=6", "app.js?v=6", "city.js?v=6", "data/vocab.js?v=6", "data/grammar.js?v=6",
  "data/comprehension.js?v=6", "data/production.js?v=6", "data/vocab2.js?v=6", "data/grammar2.js?v=6", "data/oral2.js?v=6", "data/ecrit2.js?v=6", "data/production2.js?v=6", "data/conversations.js?v=6", "manifest.webmanifest", "icons/icon-192.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "api.anthropic.com") return;
  const sameOrigin = url.origin === location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return;
  if (sameOrigin && url.pathname.endsWith("version.json")) return;
  e.respondWith(
    fetch(req, sameOrigin ? {cache:"no-store"} : undefined).then(res => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, {ignoreSearch: false}).then(r => r || caches.match(req, {ignoreSearch: true})).then(r => r || (req.mode === "navigate" ? caches.match("index.html") : undefined)))
  );
});
