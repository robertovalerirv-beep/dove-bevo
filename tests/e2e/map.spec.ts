import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  DUOMO,
  goToMilano,
  milanoFromOpenSearch,
  mapRegion,
  mapStatus,
  waitForBars,
  zoomOf,
} from "./helpers";

test("M1-06 opens on Italy with the attributions visible", async ({ page }, info) => {
  const mapLibre: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("maplibre")) mapLibre.push(r.url());
  });
  await page.goto("/");
  // First a static picture of Italy (ADR 0014), no MapLibre download…
  const preview = page.getByRole("button", { name: "Esplora la mappa" });
  await expect(preview.locator("img")).toBeVisible();
  expect(
    await preview.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);
  await page.waitForLoadState("networkidle");
  expect(mapLibre).toEqual([]);
  await page.screenshot({ path: info.outputPath("m1-06-italia-statica.png") });
  // …then the interactive map on the same view at the first touch.
  await preview.click();
  await expect(mapRegion(page)).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  expect(await zoomOf(page)).toBeLessThan(7);
  const attribution = page.locator(".map__attribution");
  await expect(attribution).toBeVisible();
  await expect(attribution).toContainText("OpenFreeMap");
  await expect(attribution).toContainText("© OpenMapTiles");
  await expect(attribution).toContainText("© OpenStreetMap contributors");
  await page.screenshot({ path: info.outputPath("m1-06-italia.png") });
});

test("M1-07 loads at most 12 cells from zoom 13 and nothing below", async ({ page }) => {
  const priceRequests: string[] = [];
  // Routing bypasses the browser HTTP cache, so every network request is counted.
  await page.route("**/api/prices/**", (route) => {
    priceRequests.push(route.request().url());
    void route.continue();
  });
  await page.goto("/");
  await expect(mapStatus(page)).toHaveText("Avvicinati o cerca una città");
  expect(priceRequests).toEqual([]);

  await goToMilano(page);
  expect(await zoomOf(page)).toBeGreaterThanOrEqual(13);
  expect(priceRequests.length).toBeGreaterThan(0);
  expect(priceRequests.length).toBeLessThanOrEqual(12);

  await mapRegion(page).locator("canvas").focus();
  // One step at a time: a key pressed during the zoom animation is relative to the animated zoom.
  for (let i = 0; i < 4 && (await zoomOf(page)) >= 13; i++) {
    const zoom = await zoomOf(page);
    await page.keyboard.press("Minus");
    await expect.poll(() => zoomOf(page)).toBeLessThan(zoom);
  }
  expect(await zoomOf(page)).toBeLessThan(13);
  await expect(mapStatus(page)).toHaveText("Avvicinati o cerca una città");
  const before = priceRequests.length;
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(1000);
  expect(priceRequests.length).toBe(before);
});

test("M1-09 the drink chips switch the prices shown", async ({ page }) => {
  await page.goto("/");
  await goToMilano(page);
  const chips = page.getByRole("group", { name: "Drink" });
  await expect(chips.getByRole("button", { name: "Birra alla spina 0,4 l" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: "Elenco" }).click();
  const list = page.getByRole("dialog", { name: "Bar nella zona" });
  await expect(list.getByRole("link", { name: /Bistrot Duomo/ })).toContainText("6,00 €");
  await list.getByRole("button", { name: "Chiudi" }).click();

  await chips.getByRole("button", { name: "Spritz" }).click();
  await expect(chips.getByRole("button", { name: "Spritz" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Elenco" }).click();
  await expect(list.getByRole("link", { name: /Bistrot Duomo/ })).toContainText("7,50 €");
  await expect(list.getByRole("link", { name: /Terrazza Aperol/ })).toContainText("10,00 € HH");
  await expect(list.getByRole("link", { name: /^Prima classe/ })).toContainText("Nessun prezzo");
});

test.describe("M1-10 with the position granted", () => {
  test.use({ geolocation: DUOMO, permissions: ["geolocation"] });
  test("centres the map on the user", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Vicino a me" }).click();
    await expect.poll(() => zoomOf(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(14.9);
    const center = (await mapRegion(page).getAttribute("data-center")) ?? "";
    const [lat = 0, lon = 0] = center.split(",").map(Number);
    expect(Math.abs(lat - DUOMO.latitude)).toBeLessThan(0.0005);
    expect(Math.abs(lon - DUOMO.longitude)).toBeLessThan(0.0005);
    await waitForBars(page);
  });
});

test.describe("M1-10 with the position denied", () => {
  test.use({ permissions: [] });
  test("invites to search and stays usable", async ({ page, context }, info) => {
    await context.clearPermissions();
    await page.goto("/");
    await page.getByRole("button", { name: "Vicino a me" }).click();
    // The way out opens by itself: the city search, with what to do on this device (desktop: Chrome-like).
    const search = page.getByRole("dialog", { name: "Cerca" });
    await expect(search.getByText(/tocca il lucchetto accanto all'indirizzo/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(search.getByRole("searchbox")).toBeFocused();
    if (info.project.name === "chromium") {
      await page.screenshot({ path: "docs/screenshots/m3/locate-denied-390.png" });
    }
    await milanoFromOpenSearch(page);
  });
});

test.describe("M3-15 with a position that never answers", () => {
  test.use({ permissions: ["geolocation"] });
  test("says it cannot find the user and points to the search", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_ok, fail) => {
        // The browser gives up: GeolocationPositionError.TIMEOUT
        setTimeout(
          () =>
            fail?.({
              code: 3,
              message: "",
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            }),
          50,
        );
      };
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Vicino a me" }).click();
    const search = page.getByRole("dialog", { name: "Cerca" });
    await expect(search.getByRole("searchbox")).toBeFocused();
    await expect(search.getByText("Non riesco a trovarti")).toHaveCount(0); // no permission hint: only a timeout
    await milanoFromOpenSearch(page);
  });
});

test("M1-11 the city search moves the map and loads the cells", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Cerca" }).click();
  await page.getByRole("searchbox", { name: "Cerca una città o un bar" }).fill("milano");
  const first = page.getByRole("list", { name: "Città e paesi" }).getByRole("button").first();
  await expect(first).toContainText("Milano");
  const request = page.waitForRequest((r) => r.url().includes("/api/prices/"));
  await first.click();
  await request;
  await waitForBars(page);
});

test("M1-12 the bar page shows details and prices, also after a reload", async ({ page }) => {
  await page.goto("/bar/n13001337602?c=u0nd9");
  const sheet = page.getByRole("dialog", { name: "Camparino in Galleria" });
  await expect(sheet.getByRole("heading", { name: "Camparino in Galleria" })).toBeVisible();
  await expect(sheet).toContainText("Galleria Vittorio Emanuele Secondo 1n02");
  await expect(sheet).toContainText("Bar · Milano");
  await expect(sheet).toContainText("Spritz");
  await expect(sheet).toContainText("12,00 €");
  await expect(sheet).toContainText(/\d{1,2} \w{3} \d{4}/);
  await expect(sheet).toContainText("1 conferma");
  await expect(sheet.getByRole("link", { name: "Indicazioni" })).toHaveAttribute(
    "href",
    /45\.46492/,
  );

  await page.reload();
  await expect(page.getByRole("heading", { name: "Camparino in Galleria" })).toBeVisible();
  await page.getByRole("button", { name: "Chiudi" }).click();
  await expect(page).toHaveURL(/\/$/);
});

/** Presses Tab (Option+Tab in WebKit, like Safari) until the named control has the focus. */
async function tabTo(page: Page, key: string, name: string) {
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press(key);
    const label = await page.evaluate(() => (document.activeElement?.textContent ?? "").trim());
    if (label === name) return;
  }
  throw new Error(`${name} not reachable with ${key}`);
}

test("M1-13 the accessible list works with the keyboard only", async ({ page, browserName }) => {
  const key = browserName === "webkit" ? "Alt+Tab" : "Tab";
  await page.goto("/");
  await tabTo(page, key, "Cerca città o bar");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("searchbox", { name: "Cerca una città o un bar" })).toBeFocused();
  await page.keyboard.type("milano");
  await expect(
    page.getByRole("list", { name: "Città e paesi" }).getByRole("button").first(),
  ).toContainText("Milano");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await waitForBars(page);

  await tabTo(page, key, "Elenco");
  await page.keyboard.press("Enter");
  const list = page.getByRole("dialog", { name: "Bar nella zona" });
  await expect(list).toBeVisible();
  expect((await new AxeBuilder({ page }).include("dialog[open]").analyze()).violations).toEqual([]);

  await page.keyboard.press("Tab"); // close button
  await page.keyboard.press("Tab"); // first bar
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog").getByRole("heading", { level: 2 })).toBeVisible();
  await expect(page).toHaveURL(/\/bar\/[nwr]\d+\?c=u0nd/);
  expect((await new AxeBuilder({ page }).include("dialog[open]").analyze()).violations).toEqual([]);
});

test("axe finds no violations on the map screen, before and after the map starts", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Esplora la mappa" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Esplora la mappa" }).click();
  await expect(mapRegion(page)).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test.describe("cells without a static file (lakes, fields, sea)", () => {
  // Corner of the fixture: some visible cells have no file and fall back to the SPA HTML.
  test.use({ geolocation: { latitude: 45.5265, longitude: 9.272 }, permissions: ["geolocation"] });
  test("count as empty and do not break the cells that exist", async ({ page }) => {
    const missing: string[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/data/fixture/v/") && !r.headers()["content-type"]?.includes("json")) {
        missing.push(r.url());
      }
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Vicino a me" }).click();
    await waitForBars(page);
    expect(missing.length).toBeGreaterThan(0);
  });
});

test("prices are drawn right after a city search, not hidden in clusters", async ({ page }) => {
  await page.goto("/");
  await goToMilano(page);
  expect(await zoomOf(page)).toBeLessThan(14.5); // search lands at zoom 14
  await page.getByRole("button", { name: "Spritz" }).click();
  await expect(mapRegion(page)).toHaveAttribute("data-prices-shown", /7,50 €/);
  await expect(mapRegion(page)).toHaveAttribute("data-prices-shown", /12,00 €/);
});

test("the status follows the cells after a denied position", async ({ page, context }) => {
  await context.clearPermissions();
  await page.goto("/");
  await page.getByRole("button", { name: "Vicino a me" }).click();
  const search = page.getByRole("dialog", { name: "Cerca" });
  await expect(search.getByText(/Per usare la posizione/)).toBeVisible();
  await milanoFromOpenSearch(page);
  await expect(mapStatus(page)).not.toHaveText(/posizione/i);
});

test("M3-15 a denied position is told also when the map is already zoomed in", async ({
  page,
  context,
}) => {
  await context.clearPermissions();
  await page.goto("/");
  await goToMilano(page);
  await page.getByRole("button", { name: "Vicino a me" }).click();
  await expect(
    page.getByRole("dialog", { name: "Cerca" }).getByText(/Per usare la posizione/),
  ).toBeVisible({ timeout: 15_000 });
});
