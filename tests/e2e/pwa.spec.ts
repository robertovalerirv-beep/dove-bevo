import { expect, test } from "@playwright/test";
import { mapStatus } from "./helpers";

// M4-07 / M4-08: the shell is installable and works offline. Needs the production build (preview).

test("M4-07 the service worker keeps the shell only, never /api or /data", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls: string[] = [];
    for (const name of names) {
      for (const request of await (await caches.open(name)).keys())
        urls.push(new URL(request.url).pathname);
    }
    return { names, urls };
  });
  expect(cached.names).toHaveLength(1);
  expect(cached.names[0]).toMatch(/^dovebevo-shell-[0-9a-f]{10}$/);
  expect(cached.urls).toContain("/");
  expect(cached.urls.some((u) => /\.js$/.test(u))).toBe(true);
  expect(cached.urls.some((u) => /\.css$/.test(u))).toBe(true);
  expect(cached.urls.some((u) => /\.woff2$/.test(u))).toBe(true);
  expect(cached.urls.some((u) => u.includes("/brand/icon-192.png"))).toBe(true);
  expect(cached.urls.filter((u) => /^\/(api|data|map)\//.test(u))).toEqual([]);
  // Browsing the app does not add anything: prices and bars are never cached.
  await page.getByRole("button", { name: "Cerca città o bar" }).click();
  await page.getByRole("combobox", { name: "Cerca una città o un bar" }).fill("campar");
  await expect(page.getByRole("option").first()).toBeVisible();
  const after = await page.evaluate(
    async () => (await (await caches.open((await caches.keys())[0] ?? "")).keys()).length,
  );
  expect(after).toBe(cached.urls.length);
});

test("M4-07 the manifest is served as such and its icons exist", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");
  const response = await request.get("/manifest.webmanifest");
  expect(response.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = (await response.json()) as { icons: { src: string }[] };
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
  expect((await request.get("/sw.js")).headers()["cache-control"]).toBe("no-cache");
});

test("M4-08 offline, after a visit, the shell opens and says so", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The worker must control the page before the connection goes away.
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Dove bevo" })).toBeVisible();
  await expect(mapStatus(page)).toHaveText(
    "Sei offline: la mappa e i prezzi tornano con la connessione",
  );
  await context.setOffline(false);
});
