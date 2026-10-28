import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
import { atHour, drinkMenuButton, goToMilano, openDrinkMenu, THEME_HOURS } from "./helpers";

// MB-14 and M5-05: every view of the app, in both themes, has no axe violation, every target is at
// least 48×48 px, nothing scrolls sideways, the keyboard reaches and leaves the sheets, and the
// motion stops with prefers-reduced-motion. Read-only: nothing is saved.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Targets under 48 px: inline links in a text, the map attribution and MapLibre's own controls are exempt. */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const sel =
      'button, a[href], select, textarea, input:not([type="checkbox"]):not([type="radio"]), [role="option"]';
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      if (el.closest(".maplibregl-ctrl, .map__attribution, .sr-only, [inert]")) continue;
      if (el.matches("p a, li > a:not(.btn)") && el.closest("p")) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue; // not shown
      if (box.width < 47.5 || box.height < 47.5)
        out.push(
          `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent).trim().slice(0, 30)}" ${String(Math.round(box.width))}×${String(Math.round(box.height))}`,
        );
    }
    return out;
  });
}

async function check(page: Page, name: string) {
  const axe = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(axe.violations.map((v) => `${name}: ${v.id}`)).toEqual([]);
  expect((await smallTargets(page)).map((t) => `${name}: ${t}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const scheme of ["light", "dark"] as const) {
  test(`MB-14 M5-05 ${scheme}: every view is accessible and has comfortable targets`, async ({
    page,
  }, info) => {
    // Twelve views in one test: under the load of the whole suite WebKit needs more than the default minute.
    test.setTimeout(180_000);
    await atHour(page, THEME_HOURS[scheme]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
    await goToMilano(page);
    await check(page, "map");
    await page.screenshot({ path: info.outputPath(`a11y-map-${scheme}.png`) });

    await openDrinkMenu(page);
    await check(page, "drink menu");
    await drinkMenuButton(page).click(); // Esc closing it is tested in drink-menu.spec.ts

    await page.getByRole("button", { name: "Elenco" }).click();
    await check(page, "list");
    await page.getByRole("button", { name: "Chiudi" }).click();

    await page.getByRole("button", { name: "Cerca città o bar" }).click();
    await check(page, "search");
    // The keyboard stays inside the sheet, and Esc gives the map back.
    for (let i = 0; i < 14; i++) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Aggiungi prezzo" }).click();
    await check(page, "add price: bar");
    await page.getByRole("button", { name: "Non trovi il bar?" }).click();
    await check(page, "propose bar");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Aggiungi prezzo" }).click();
    await page.getByRole("list", { name: "Bar vicini" }).getByRole("button").first().click();
    await check(page, "add price: drink");
    await page.getByRole("button", { name: "Spritz" }).first().click();
    await check(page, "add price: price");
    await page.screenshot({ path: info.outputPath(`a11y-price-${scheme}.png`) });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goto("/bar/n13001337602?c=u0nd9");
    await expect(page.getByRole("dialog")).toBeVisible();
    await check(page, "bar");
    await page.getByRole("button", { name: "Segnala un problema con il bar" }).click();
    await check(page, "report");
  });
}

test("M5-05 prefers-reduced-motion stops the animations and the transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/bar/n13001337602?c=u0nd9");
  await expect(page.getByRole("dialog")).toBeVisible();
  const slow = await page.evaluate(() => {
    const out: string[] = [];
    const seconds = (v: string) =>
      v.split(",").map((x) => (x.trim().endsWith("ms") ? parseFloat(x) / 1000 : parseFloat(x)));
    for (const el of document.querySelectorAll<HTMLElement>(
      ".btn, .chip, dialog, .sheet, .scontrino, a",
    )) {
      const s = getComputedStyle(el);
      if (
        [...seconds(s.animationDuration), ...seconds(s.transitionDuration)].some((n) => n > 0.011)
      )
        out.push(`${el.tagName}.${el.className} ${s.animationDuration} ${s.transitionDuration}`);
    }
    return out;
  });
  expect(slow).toEqual([]);
});

test("M5-05 the page can be used with the keyboard alone: Tab reaches the main actions", async ({
  page,
}) => {
  await page.goto("/");
  const reached = new Set<string>();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    reached.add(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el?.getAttribute("aria-label") ?? el?.textContent.trim() ?? "";
      }),
    );
  }
  for (const name of ["Aggiungi prezzo", "Aggiungi locale mancante", "Elenco"])
    expect([...reached].some((n) => n.startsWith(name))).toBe(true);
});
