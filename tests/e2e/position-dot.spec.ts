import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
import { atHour, DUOMO, mapRegion, THEME_HOURS, waitForBars, tapMap } from "./helpers";

// MC-05 / D-33: a small dot where "Vicino a me" found the device, static until pressed again.
const BRERA = { latitude: 45.4719, longitude: 9.1881 };

/** Screen point of the drawn dot inside the map canvas, null when none is drawn. */
async function dotAt(page: Page) {
  const value = (await mapRegion(page).getAttribute("data-me")) ?? "";
  if (!value) return null;
  const [x = 0, y = 0] = value.split(",").map(Number);
  return { x, y };
}

async function expectDotAtCentre(page: Page) {
  const canvas = await mapRegion(page).locator("canvas.maplibregl-canvas").boundingBox();
  await expect
    .poll(async () => {
      const at = await dotAt(page);
      if (!at || !canvas) return Infinity;
      return Math.max(Math.abs(at.x - canvas.width / 2), Math.abs(at.y - canvas.height / 2));
    })
    .toBeLessThanOrEqual(2);
}

async function expectCentredOn(page: Page, at: { latitude: number; longitude: number }) {
  await expect
    .poll(async () => {
      const [lat = 0, lon = 0] = ((await mapRegion(page).getAttribute("data-center")) ?? "")
        .split(",")
        .map(Number);
      return Math.max(Math.abs(lat - at.latitude), Math.abs(lon - at.longitude));
    })
    .toBeLessThan(0.0005);
}

test.describe("MC-05 position dot", () => {
  test.use({ geolocation: DUOMO, permissions: ["geolocation"] });

  test("appears only after Vicino a me and stays until pressed again", async ({ page }) => {
    // The device answers with window.__where (the browser's own cache would keep the first fix);
    // watchPosition is counted: the dot must never follow the device on its own.
    await page.addInitScript(
      (first) => {
        const w = window as unknown as { __where: number[]; __watched: number };
        w.__where = first;
        w.__watched = 0;
        navigator.geolocation.getCurrentPosition = (ok) => {
          const [latitude = 0, longitude = 0] = w.__where;
          setTimeout(() => {
            ok({ coords: { latitude, longitude, accuracy: 10 } } as GeolocationPosition);
          }, 20);
        };
        navigator.geolocation.watchPosition = () => ++w.__watched;
      },
      [DUOMO.latitude, DUOMO.longitude],
    );
    await page.goto("/");
    expect(await dotAt(page)).toBeNull();
    await page.getByRole("button", { name: "Vicino a me" }).click();
    await waitForBars(page);
    await expectCentredOn(page, DUOMO);
    await expectDotAtCentre(page);

    // The device moves: the dot does not follow on its own.
    const before = await dotAt(page);
    await page.evaluate(
      (where) => {
        (window as unknown as { __where: number[] }).__where = where;
      },
      [BRERA.latitude, BRERA.longitude],
    );
    await page.waitForTimeout(2000);
    expect(await dotAt(page)).toEqual(before);

    // Pressed again: the map and the dot go to the new position.
    await page.getByRole("button", { name: "Vicino a me" }).click();
    await expectCentredOn(page, BRERA);
    await expectDotAtCentre(page);
    expect(await page.evaluate(() => (window as unknown as { __watched: number }).__watched)).toBe(
      0,
    );
  });

  test("reading the position for Aggiungi prezzo does not show it", async ({ page }) => {
    await page.goto("/");
    await tapMap(page);
    await expect(mapRegion(page)).toHaveAttribute("data-ready", "true");
    await page.getByRole("button", { name: "Aggiungi prezzo" }).click();
    await expect(page.getByRole("list", { name: "Bar vicini" }).getByRole("button")).toHaveCount(5);
    await page.waitForTimeout(1000);
    expect(await dotAt(page)).toBeNull();
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`${scheme}: screenshot and no axe violations`, async ({ page }, info) => {
      await atHour(page, THEME_HOURS[scheme]);
      await page.goto("/");
      await page.getByRole("button", { name: "Vicino a me" }).click();
      await waitForBars(page);
      await expectDotAtCentre(page);
      await page.screenshot({ path: info.outputPath(`mc-05-dot-${scheme}.png`) });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }
});
