import { expect, type Page, type Request } from "@playwright/test";
import { test } from "./fixtures";
import { mapRegion } from "./helpers";

// MF-01 / MF-02 (SPEC 1.12): on the map page the files of the map are fetched ahead of time (a plain
// low-priority fetch, so it works in Safari too), never run until the first touch, and never on the
// other pages. Needs the production build.
//
// What this suite cannot show: that the first touch is then served from the browser cache. The local
// preview is HTTPS with a self-signed certificate, and neither Chromium nor Playwright's WebKit keep
// responses of such a connection in their HTTP cache. That check is manual, on a phone (PROGRESS).

const MAP_FILE = /maplibre/;
const FETCH_TYPES = ["fetch", "xhr"]; // WebKit reports a fetch() as xhr

function watchMapRequests(page: Page) {
  const seen: Request[] = [];
  page.on("request", (r) => {
    if (MAP_FILE.test(r.url())) seen.push(r);
  });
  return seen;
}

async function waitForFetchedAhead(page: Page, seen: Request[]) {
  await expect.poll(() => seen.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
  await page.waitForLoadState("networkidle");
}

test("MF-01 the map page fetches the files of the map ahead of time and does not run them", async ({
  page,
}) => {
  const seen = watchMapRequests(page);
  await page.goto("/");
  await waitForFetchedAhead(page, seen);

  const paths = seen.map((r) => new URL(r.url()).pathname);
  expect(paths.some((p) => /^\/assets\/maplibre-map-.+\.js$/.test(p))).toBe(true);
  expect(paths.some((p) => /^\/assets\/maplibre-map-.+\.css$/.test(p))).toBe(true);
  expect(paths.some((p) => /^\/assets\/maplibre-gl-worker-.+\.mjs$/.test(p))).toBe(true);
  // A fetch, not a script, a stylesheet or a worker; once each, only our own files.
  expect(seen.every((r) => FETCH_TYPES.includes(r.resourceType()))).toBe(true);
  expect(new Set(paths).size).toBe(paths.length);
  expect(paths.every((p) => p.startsWith("/assets/"))).toBe(true);
  // No hint tags (they would parse the script or do nothing in Safari) and nothing run: still the
  // picture of Italy, no canvas.
  // (Vite's own modulepreload of the shell chunks, e.g. the dictionary, are not the map.)
  expect(
    await page.locator('link[rel="modulepreload"][href*="maplibre"], link[rel="prefetch"]').count(),
  ).toBe(0);
  await expect(page.getByRole("button", { name: "Esplora la mappa" })).toBeVisible();
  expect(await page.locator("canvas.maplibregl-canvas").count()).toBe(0);
  expect(await mapRegion(page).getAttribute("data-ready")).not.toBe("true");
});

for (const path of ["/privacy", "/regole", "/admin"]) {
  test(`MF-01 ${path} fetches nothing of the map`, async ({ page }) => {
    const seen = watchMapRequests(page);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // Past the moment the map page would have started (idle callback, at most 4 s, or its timer).
    await page.waitForTimeout(5_000);
    expect(seen.map((r) => r.url())).toEqual([]);
  });
}

test("MF-02 the files come with a long cache and the first touch asks for nothing else of the map", async ({
  page,
}) => {
  const seen = watchMapRequests(page);
  await page.goto("/");
  await waitForFetchedAhead(page, seen);
  const ahead = new Set(seen.map((r) => new URL(r.url()).pathname));
  // Long cache (immutable): what lets the browser keep the files until the first touch.
  for (const r of seen) {
    const response = await r.response();
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  }
  const api: string[] = [];
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (/^\/(api|data)\//.test(path)) api.push(path);
  });
  const before = seen.length;
  await page.getByRole("button", { name: "Esplora la mappa" }).click();
  await expect(mapRegion(page)).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  // After the touch the map asks only for the files already fetched, never for another one of its own.
  expect(seen.slice(before).every((r) => ahead.has(new URL(r.url()).pathname))).toBe(true);
  // The fetch ahead of time added nothing to /api or /data.
  expect(api.filter((p) => /maplibre/.test(p))).toEqual([]);
});

test("MF-01 with the data saver on nothing of the map is fetched before the touch", async ({
  page,
}) => {
  // `navigator.connection` is a Chromium API (Safari has none): the init script defines it on any
  // engine, so this also runs on WebKit and checks the same guard.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      value: { saveData: true },
      configurable: true,
    });
  });
  const seen = watchMapRequests(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // Past the moment the map page would have started (idle callback, at most 4 s, or its timer).
  await page.waitForTimeout(5_000);
  expect(seen.map((r) => r.url())).toEqual([]);
  await expect(page.getByRole("button", { name: "Esplora la mappa" })).toBeVisible();
  // The touch still starts the map as always.
  await page.getByRole("button", { name: "Esplora la mappa" }).click();
  await expect(mapRegion(page)).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
});
