// SPEC 1.12: once the page is loaded and the phone is idle, the browser fetches the files of the map
// (MapLibre, ~1 MB) ahead of time. A plain low-priority fetch fills the HTTP cache and never runs the
// script, so the page stays as light as before for Lighthouse and the first touch only has to start
// the map. `fetch` works in Safari too, where a `<link rel="prefetch">` does nothing.

const MAP_FILE = /^\/[^/][^\s]*\.(?:js|css|mjs)$/;

/** The paths written by the build in the `map-chunk` meta tag; only paths of this site. */
export function warmupFiles(content: string | null, saveData: boolean): string[] {
  if (!content || saveData) return [];
  return content.split(" ").filter((href) => MAP_FILE.test(href) && !href.startsWith("//"));
}

async function fetchAhead(href: string) {
  try {
    // Same mode and credentials as the real load (import(), the stylesheet link, `new Worker`).
    const response = await fetch(href, { priority: "low" });
    // The body has to arrive whole to be kept in the cache; it is dropped without being read.
    if (response.ok) await response.arrayBuffer();
  } catch {
    // Offline or a failed request: the first touch will load the file as it always did.
  }
}

function start() {
  const content = document.querySelector('meta[name="map-chunk"]')?.getAttribute("content") ?? null;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  for (const href of warmupFiles(content, connection?.saveData === true)) void fetchAhead(href);
}

/** After `load`, in the first idle moment (a timer where the browser has no idle callback). */
export function warmUpMapWhenIdle() {
  const schedule = () => {
    if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 4000 });
    else setTimeout(start, 2000);
  };
  if (document.readyState === "complete") schedule();
  else addEventListener("load", schedule, { once: true });
}
