import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// M5-04: /privacy and /regole, reachable from the search sheet and from the bar receipt.

const PAGES = [
  { path: "/privacy", title: "Privacy", text: "La tua posizione" },
  { path: "/regole", title: "Regole", text: "Servizio per maggiorenni" },
] as const;

for (const { path, title, text } of PAGES) {
  for (const scheme of ["light", "dark"] as const) {
    test(`${path} in ${scheme}: content, logo, axe, targets, no CSP violation`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.clock.setFixedTime(
        new Date(scheme === "dark" ? "2026-10-24T22:30:00" : "2026-10-24T12:00:00"),
      );
      const csp: string[] = [];
      page.on("console", (msg) => {
        if (/content security policy|refused to/i.test(msg.text())) csp.push(msg.text());
      });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByRole("heading", { name: text })).toBeVisible();
      await expect(page.locator("main")).toContainText("Ultimo aggiornamento");
      await expect(
        page.getByRole("img", { name: "Dove bevo" }).locator("visible=true"),
      ).toHaveCount(1);
      await expect(page.getByRole("link", { name: /ciao@/ })).toBeVisible();
      await expect(page).toHaveTitle(new RegExp(`^${title} · Dove bevo`));

      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(axe.violations).toEqual([]);

      // Every link and button is at least 48×48 px (SPEC 15).
      for (const box of await page
        .locator("main a.btn, main a.legal__logo")
        .evaluateAll((els) =>
          els.map((e) => e.getBoundingClientRect().toJSON() as { width: number; height: number }),
        ))
        expect(box.height).toBeGreaterThanOrEqual(47.5);
      expect(csp).toEqual([]);
      // No horizontal scroll at 390 px.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `docs/screenshots/legal/${path.slice(1)}-${scheme}.png`,
        fullPage: true,
      });
    });
  }
}

test("the pages are linked from the search sheet and from the bar receipt", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Cerca" }).click();
  const search = page.getByRole("dialog", { name: "Cerca" });
  await expect(search.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  await expect(search.getByRole("link", { name: "Regole" })).toHaveAttribute("href", "/regole");

  await page.goto("/bar/n13001337602?c=u0nd9");
  const bar = page.getByRole("dialog");
  await expect(bar.getByRole("link", { name: "Regole" })).toBeVisible();
  await bar.getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
  await page.getByRole("link", { name: "Regole" }).click();
  await expect(page).toHaveURL(/\/regole$/);
  await page.getByRole("link", { name: "Torna alla mappa" }).last().click();
  await expect(page).toHaveURL(/\/$/);
});

test("the legal pages do not load the map", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(new URL(r.url()).pathname + new URL(r.url()).host));
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(requests.filter((r) => /maplibre|openfreemap|\/api\/|\/data\//.test(r))).toEqual([]);
});
