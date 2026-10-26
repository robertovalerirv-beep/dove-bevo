// Service worker (SPEC 7.7, M4-07/08): written by hand, no library. Precaches only the shell
// (HTML, entry JS and CSS, fonts, icons). Never touches /api/*, /data/*, /map/* or other origins:
// prices and bars are always live. Pure: the Vite plugin in vite.config.ts emits the file.

/** The text of `sw.js` for a list of shell URLs; `version` names the cache so a deploy replaces it. */
export function renderSw(urls: string[], version: string): string {
  return `// Generated at build time (scripts/sw.ts). Cache: shell only.
const CACHE = "dovebevo-shell-${version}";
const SHELL = ${JSON.stringify(urls)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Authorization must reach the network; an offline shell is not an authorization result.
  if (["/mobile-auth", "/mobile-auth/", "/mobile-auth.html", "/mobile/callback"].includes(url.pathname)) return;
  // The app page: network first, the cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
    return;
  }
  // Only the shell files are answered from the cache; everything else goes to the network.
  if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
  }
});
`;
}
