import { expect, type Locator, type Page } from "@playwright/test";
import { chooseEnglish } from "./english-helpers";
import { test } from "./fixtures";
import { atHour, drinkList, goToMilano, mapStatus, openDrinkMenu, THEME_HOURS } from "./helpers";

// SPEC 1.18 (ADR 0048): the map gets the room of the phone. One row on top (mark, search, drink, near me),
// one row at the bottom, controls drawn 40 px tall with a 48 px target, the attribution dark at night.

const LANGS = [
  { lang: "it", search: "Cerca città o bar", add: "Aggiungi locale", near: "Vicino a me" },
  { lang: "en", search: "Search city or bar", add: "Add a place", near: "Near me" },
] as const;

const WIDTHS = [390, 360, 320] as const;

/** The drink menu in either language: its title is only the accessible name now. */
const drinkButton = (page: Page) =>
  page.getByRole("button", { name: /^(Scegli cosa bere|Choose what to drink)/ });

async function open(page: Page, scheme: "light" | "dark", lang: "it" | "en") {
  await atHour(page, THEME_HOURS[scheme]);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
  if (lang === "en") await chooseEnglish(page);
}

const box = async (locator: Locator) => {
  const b = await locator.boundingBox();
  if (!b) throw new Error("not visible");
  return b;
};

/** Height of the drawn face of a control (its ::before), which may be smaller than the 48 px target. */
const faceHeight = (locator: Locator) =>
  locator.evaluate((node) => Number.parseFloat(getComputedStyle(node, "::before").height));

for (const scheme of ["light", "dark"] as const) {
  for (const { lang, search, add, near } of LANGS) {
    test(`SPEC 1.18 ${scheme} ${lang}: one row on top and one at the bottom, the map takes the rest`, async ({
      page,
    }, info) => {
      await open(page, scheme, lang);
      const top = await box(page.locator("header.top"));
      const bottom = await box(page.locator(".bottom"));
      const map = await box(page.locator("section.map"));
      expect(top.height, "header height").toBeLessThanOrEqual(56);
      expect(bottom.height, "bottom bar height").toBeLessThanOrEqual(60);
      expect(map.height, "map height at 390×844").toBeGreaterThanOrEqual(728);

      // Search, drink and near me share the row of the mark.
      const row = await Promise.all(
        [
          page.getByRole("button", { name: search }),
          drinkButton(page),
          page.getByRole("button", { name: near }),
        ].map(box),
      );
      expect(new Set(row.map((b) => Math.round(b.y))).size, "one row").toBe(1);
      for (const b of row) {
        expect(b.width).toBeGreaterThanOrEqual(48);
        expect(b.height).toBeGreaterThanOrEqual(48);
        expect(b.x + b.width).toBeLessThanOrEqual(390);
      }

      // The two buttons of the bar: one row, the whole text visible.
      const nav = page.getByRole("navigation").filter({ has: page.locator(".bottom__primary") });
      const buttons = nav.getByRole("button");
      await expect(buttons.nth(1)).toHaveText(add);
      const bar = await Promise.all([0, 1].map((i) => box(buttons.nth(i))));
      expect(new Set(bar.map((b) => Math.round(b.y))).size).toBe(1);
      for (const b of bar) expect(b.height).toBeGreaterThanOrEqual(48);
      for (const i of [0, 1])
        expect(await buttons.nth(i).evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`map-space-${scheme}-${lang}.png`) });
    });
  }

  test(`SPEC 1.18 ${scheme}: the controls are drawn 40 px tall and tapped on 48 px`, async ({
    page,
  }) => {
    await open(page, scheme, "it");
    const controls = [
      page.getByRole("button", { name: "Cerca città o bar" }),
      drinkButton(page),
      page.getByRole("button", { name: "Vicino a me" }),
      page.getByRole("button", { name: /^Lingua/ }),
      page.getByRole("button", { name: "Elenco" }),
      page.getByRole("button", { name: "Aggiungi prezzo" }),
      page.getByRole("button", { name: "Aggiungi locale" }),
    ];
    for (const control of controls) {
      const b = await box(control);
      expect(b.height, await control.innerText()).toBeGreaterThanOrEqual(48);
      expect(b.width).toBeGreaterThanOrEqual(48);
      expect(await faceHeight(control)).toBeLessThanOrEqual(40);
    }
  });

  test(`SPEC 1.18 ${scheme}: the attribution has the colours of the theme and stays readable`, async ({
    page,
  }) => {
    await open(page, scheme, "it");
    const colours = await page
      .locator(".map__attribution a")
      .first()
      .evaluate((link) => {
        // The browser turns any computed colour (even a colour-mix) into rgb through a canvas pixel.
        const rgb = (value: string) => {
          const ctx = document.createElement("canvas").getContext("2d");
          if (!ctx) throw new Error("no canvas");
          ctx.canvas.width = ctx.canvas.height = 1;
          ctx.fillStyle = value;
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
        };
        const bg = getComputedStyle(link.parentElement as Element).backgroundColor;
        return { text: rgb(getComputedStyle(link).color), bg: rgb(bg) };
      });
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
    };
    const [hi, lo] = [lum(colours.text), lum(colours.bg)].sort((a, b) => b - a) as [number, number];
    expect((hi + 0.05) / (lo + 0.05), "contrast").toBeGreaterThanOrEqual(4.5);
    // Night: a dark strip with light text; day: the opposite.
    if (scheme === "dark") expect(lum(colours.bg)).toBeLessThan(0.1);
    else expect(lum(colours.bg)).toBeGreaterThan(0.5);
  });

  test(`SPEC 1.18 ${scheme}: the open drink list is as wide as the header and inside the screen`, async ({
    page,
  }) => {
    await open(page, scheme, "it");
    await openDrinkMenu(page);
    const list = drinkList(page);
    await expect(list.getByRole("checkbox")).toHaveCount(9);
    const l = await box(list);
    const top = await box(page.locator("header.top"));
    expect(l.x).toBeGreaterThanOrEqual(top.x);
    expect(l.x + l.width).toBeLessThanOrEqual(top.x + top.width + 1);
    expect(l.y + l.height).toBeLessThanOrEqual(844);
    // The title is not written any more, but it is still the name of the button (SPEC 7.1).
    await expect(page.getByRole("button", { name: /^Scegli cosa bere/ })).toHaveCount(1);
  });
}

for (const width of WIDTHS) {
  test(`SPEC 1.18 ${String(width)} px: nothing sticks out and the controls stay on one row`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 700 });
    await open(page, "light", "it");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    const row = await Promise.all(
      [
        page.getByRole("button", { name: "Cerca città o bar" }),
        drinkButton(page),
        page.getByRole("button", { name: "Vicino a me" }),
      ].map(box),
    );
    expect(new Set(row.map((b) => Math.round(b.y))).size).toBe(1);
    for (const b of row) expect(b.width).toBeGreaterThanOrEqual(48);
    // The language and list icons and the bar do not leave the screen either.
    for (const name of [/^Lingua/, "Elenco", "Aggiungi prezzo", "Aggiungi locale"]) {
      const b = await box(page.getByRole("button", { name }));
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(width);
    }
  });
}

test("SPEC 1.18 the coverage sentence is one line at 390 px", async ({ page }) => {
  await open(page, "light", "it");
  await goToMilano(page);
  const status = await box(mapStatus(page));
  expect(status.height, "one line of text plus the pill").toBeLessThanOrEqual(38);
});
