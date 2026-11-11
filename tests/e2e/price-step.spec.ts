import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
import { chooseEnglish } from "./english-helpers";
import { atHour, DUOMO, smallTargets, THEME_HOURS, waitForBars } from "./helpers";

// The «Prezzo» step (SPEC 7.3, 1.19): compact enough that «Salva» is in view without scrolling, with
// the prices already seen in the zone and the median line (the longest case: five wine prices in
// u0nd9); «Indietro» is an icon, so the bar name is read in full. Read-only: nothing is saved.

const AXE = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const TEXT = {
  it: {
    add: "Aggiungi prezzo",
    search: "Cerca il bar per nome",
    wine: /^Calice di vino/,
    back: "Indietro",
    save: "Salva",
    seen: "Prezzi già visti qui",
  },
  en: {
    add: "Add a price",
    search: "Search the bar by name",
    wine: /^Glass of wine/,
    back: "Back",
    save: "Save",
    seen: "Prices already seen here",
  },
} as const;

async function openPriceStep(page: Page, lang: keyof typeof TEXT) {
  const t = TEXT[lang];
  await page.goto("/");
  await page.getByRole("button", { name: "Vicino a me" }).click();
  await waitForBars(page);
  if (lang === "en") await chooseEnglish(page);
  await page.getByRole("button", { name: t.add, exact: true }).click();
  await page.getByRole("searchbox", { name: t.search }).fill("Terrazza Aperol");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Terrazza Aperol/ })
    .first()
    .click();
  await page.getByRole("dialog").getByRole("button", { name: t.wine }).click();
  const sheet = page.getByRole("dialog", { name: "Terrazza Aperol" });
  await expect(sheet.getByRole("list", { name: t.seen })).toBeVisible();
  return sheet;
}

test.describe("price step", () => {
  test.use({ geolocation: DUOMO, permissions: ["geolocation"] });

  for (const lang of ["it", "en"] as const)
    for (const scheme of ["light", "dark"] as const)
      test(`compact: «Salva» in view without scrolling, full bar name, icon back (${lang}, ${scheme})`, async ({
        page,
      }, info) => {
        await atHour(page, THEME_HOURS[scheme]);
        const t = TEXT[lang];
        const sheet = await openPriceStep(page, lang);

        // «Salva» whole in the viewport, without scrolling the sheet.
        await expect(sheet.getByRole("button", { name: t.save })).toBeInViewport({ ratio: 1 });
        expect(
          await sheet
            .locator(".sheet__body")
            .evaluate((el) => el.closest("dialog")?.scrollTop ?? 0),
        ).toBe(0);

        // The bar name is not cut with «…».
        const title = sheet.getByRole("heading", { level: 2, name: "Terrazza Aperol" });
        expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

        // «Indietro» keeps its name and a 48 px target, but shows only the arrow.
        const back = sheet.getByRole("button", { name: t.back, exact: true });
        const box = await back.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(47.5);
        expect(box?.width).toBeLessThan(64);
        expect(box?.height).toBeGreaterThanOrEqual(47.5);

        // Smaller type than before (question 44 → 26 px, digits 48 → 32 px).
        const size = (sel: string) =>
          sheet.locator(sel).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        expect(await size(".question")).toBeLessThanOrEqual(26);
        expect(await size(".price-input input")).toBeLessThanOrEqual(32);
        expect(await size(".sheet__title")).toBeLessThanOrEqual(19);
        const field = await sheet.locator(".price-input input").boundingBox();
        expect(field?.height).toBeLessThanOrEqual(60);

        expect(await smallTargets(page)).toEqual([]);
        const axe = await new AxeBuilder({ page }).include("dialog[open]").withTags(AXE).analyze();
        expect(axe.violations).toEqual([]);
        await page.screenshot({ path: info.outputPath(`prezzo-${lang}-${scheme}.png`) });
      });

  for (const width of [360, 320])
    test(`at ${String(width)} px nothing runs off the edge`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 740 });
      const sheet = await openPriceStep(page, "it");
      const overflow = await sheet.evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(overflow).toBe(false);
      await expect(sheet.getByRole("button", { name: "Indietro", exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath(`prezzo-${String(width)}.png`) });
    });
});
