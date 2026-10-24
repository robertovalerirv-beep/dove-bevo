import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixtures";
import { atHour, THEME_HOURS } from "./helpers";

// MB-04: the controls of the kit. Buttons and fields have a 2 px `ink` border; buttons carry the
// `shadow-stampa` and go down by 3 px when pressed; every focused control has a 3 px outline 2 px away.

/** The computed rgb of a token, resolved by the browser (the CSS holds hexadecimals only in tokens.css). */
const tokenColor = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement("i");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    return rgb;
  }, token);

const css = (el: Locator, property: string) =>
  el.evaluate((node, p) => getComputedStyle(node).getPropertyValue(p), property);

for (const scheme of ["light", "dark"] as const) {
  test(`MB-04 ${scheme}: border, shadow, press and focus of the controls`, async ({ page }) => {
    await atHour(page, THEME_HOURS[scheme]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
    const ink = await tokenColor(page, "--ink");

    const primary = page.getByRole("button", { name: "Aggiungi prezzo" });
    const secondary = page.getByRole("button", { name: "Aggiungi locale mancante" });
    const search = page.getByRole("button", { name: "Cerca città o bar" });
    const menu = page.getByRole("button", { name: /^Scegli cosa bere/ });

    for (const control of [primary, secondary, search, menu]) {
      await expect(control).toBeVisible();
      expect(await css(control, "border-top-width")).toBe("2px");
      expect(await css(control, "border-top-color")).toBe(ink);
      expect(await css(control, "border-top-style")).toBe("solid");
    }
    // The stamp shadow: 3 px right and down, hard edge, in the ink colour of the theme.
    for (const control of [primary, secondary, search]) {
      const box = await css(control, "box-shadow");
      expect(box).toMatch(/ 3px 3px 0px/);
      expect(box.startsWith("rgb")).toBe(true);
    }

    // Pressed, the button goes down by 3 px onto its shadow.
    const at = (await primary.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await expect.poll(() => css(primary, "transform")).toBe("matrix(1, 0, 0, 1, 3, 3)");
    await page.mouse.move(1, 1); // away from the button: no tap
    await page.mouse.up();

    // Focus from the keyboard: 3 px outline at 2 px, on each control. A reload first, so no mouse focus is left.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const state = await page.evaluate(() => {
        const el = document.activeElement;
        // The map fills the screen, so its own focus ring is drawn inside it (app.css, `.map__preview` and the canvas).
        if (!el || el === document.body || !el.matches(":focus-visible")) return null;
        if (el.matches(".map__preview, .maplibregl-canvas")) return null;
        const s = getComputedStyle(el);
        return {
          name: el.getAttribute("aria-label") ?? el.textContent.trim().slice(0, 25),
          width: s.outlineWidth,
          offset: s.outlineOffset,
          style: s.outlineStyle,
        };
      });
      if (!state) continue;
      expect(state).toMatchObject({ width: "3px", offset: "2px", style: "solid" });
      seen.push(state.name);
    }
    expect(seen.length).toBeGreaterThanOrEqual(4);

    // The field of the search sheet: same border.
    await search.click();
    const field = page.getByRole("combobox", { name: "Cerca una città o un bar" });
    await expect(field).toBeVisible();
    expect(await css(field, "border-top-width")).toBe("2px");
    expect(await css(field, "border-top-color")).toBe(ink);
    await page.screenshot({ path: `docs/screenshots/mb/mb-04-${scheme}.png` });
  });
}

test("MB-04 with prefers-reduced-motion the press changes shape but nothing animates", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const primary = page.getByRole("button", { name: "Aggiungi prezzo" });
  expect(await css(primary, "transition-duration")).toMatch(/^0s(, 0s)*$/);
  expect(await css(primary, "animation-duration")).toBe("0s");
});
