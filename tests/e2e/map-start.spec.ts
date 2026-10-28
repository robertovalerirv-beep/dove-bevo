import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixtures";
import { atHour, mapRegion, mapStatus, THEME_HOURS } from "./helpers";

// MH-01, MH-02 (SPEC 1.13, D-37, ADR 0040): while the map is still the static picture, a button in the
// centre says what to do; the message «Avvicinati…» is for after the first tap. Read-only.

const AXE = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const START_IT = "Clicca sulla mappa o cerca una città";
const ZOOM_IN_IT = "Avvicinati per vedere i prezzi, o cerca una città.";

const startButton = (page: Page) => page.getByRole("button", { name: START_IT });

const box = async (locator: Locator) => {
  const b = await locator.boundingBox();
  if (!b) throw new Error("not visible");
  return b;
};
type Box = { x: number; y: number; width: number; height: number };
const apart = (a: Box, b: Box) =>
  a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;

for (const scheme of ["light", "dark"] as const) {
  for (const width of [390, 360] as const) {
    test(`MH-01 ${scheme} ${String(width)} px: the button is in the centre while the map is a picture`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await atHour(page, THEME_HOURS[scheme]);
      await page.goto("/");
      const start = startButton(page);
      await expect(start).toBeVisible();
      // The message of the top is not there yet.
      await expect(mapStatus(page)).toHaveCount(0);

      const map = await box(mapRegion(page));
      const b = await box(start);
      expect(b.width).toBeGreaterThanOrEqual(48);
      expect(b.height).toBeGreaterThanOrEqual(48);
      // In the centre of the map, and inside it.
      expect(Math.abs(b.x + b.width / 2 - (map.x + map.width / 2))).toBeLessThanOrEqual(2);
      expect(Math.abs(b.y + b.height / 2 - (map.y + map.height / 2))).toBeLessThanOrEqual(2);
      expect(b.x).toBeGreaterThanOrEqual(map.x);
      expect(b.x + b.width).toBeLessThanOrEqual(map.x + map.width);
      // The whole text is readable: it wraps, it does not run out of the button.
      expect(await start.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
      // It covers none of the other controls.
      for (const other of [
        page.getByRole("button", { name: /^Lingua/ }),
        page.getByRole("button", { name: "Elenco" }),
        page.locator(".map__attribution"),
      ])
        expect(apart(b, await box(other))).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(AXE).analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`mh-01-${scheme}-${String(width)}.png`) });
    });
  }
}

test("MH-01 a tap on the button starts the map: the button goes, the message of the top comes", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Azioni della mappa" });
  const before = { map: await box(mapRegion(page)), bar: await box(nav) };
  await startButton(page).click();
  await expect(mapRegion(page)).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  await expect(startButton(page)).toHaveCount(0);
  await expect(mapStatus(page)).toHaveText(ZOOM_IN_IT);
  // The map and the bar keep their size (M1-16).
  expect(await box(mapRegion(page))).toEqual(before.map);
  expect(await box(nav)).toEqual(before.bar);
});

test("MH-01 a tap on the map itself starts it too", async ({ page }) => {
  await page.goto("/");
  await expect(startButton(page)).toBeVisible();
  await page
    .getByRole("button", { name: "Esplora la mappa" })
    .click({ position: { x: 40, y: 200 } });
  await expect(mapRegion(page)).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  await expect(startButton(page)).toHaveCount(0);
  await expect(mapStatus(page)).toHaveText(ZOOM_IN_IT);
});

test("MH-01 an address with coordinates starts the map at once: no button", async ({ page }) => {
  await page.goto("/?at=45.46437,9.18951");
  await expect(mapRegion(page)).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  await expect(startButton(page)).toHaveCount(0);
});

test("MH-01 the button asks for nothing from the network", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (/^\/(api|data)\//.test(path)) requests.push(path);
  });
  await page.goto("/");
  await expect(startButton(page)).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(requests).toEqual([]);
});

test("MH-02 in English the button speaks English and follows the menu, with no Italian left", async ({
  page,
}) => {
  await page.goto("/");
  await expect(startButton(page)).toBeVisible();
  await page.getByRole("button", { name: /^Lingua/ }).click();
  await page
    .getByRole("group", { name: "Lingua" })
    .getByRole("button", { name: "English" })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const start = page.getByRole("button", { name: "Tap the map or search for a city" });
  await expect(start).toBeVisible();
  await expect(startButton(page)).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain(START_IT);
  await start.click();
  // The region is named in English too.
  await expect(page.getByRole("region", { name: "Map", exact: true })).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 30_000 },
  );
  await expect(mapStatus(page)).toHaveText("Zoom in to see prices, or search for a city.");
});
