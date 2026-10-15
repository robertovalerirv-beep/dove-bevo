import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { waitForBars, zoomOf } from "./helpers";

// M5-14 and M5-15: the coverage dashboard of /admin (ADR 0022). The admin API is simulated, as in
// admin.spec.ts: locally there is no Cloudflare Access in front of it. The city names and the
// bar totals come from the fixture's places.json (Milano 62505581, Sesto San Giovanni 62514732…).
const MILANO = 62505581;
const SESTO = 62514732;

const COVERAGE = {
  at: "2026-10-15T09:05:07.000Z",
  active: 60,
  bars: 17,
  prices: 48,
  cities: [
    [MILANO, 12, 40, "2026-10-12"],
    [SESTO, 3, 5, "2026-10-11"],
  ],
  none: [2, 3, "2026-10-10"],
};
const EMPTY_OVERVIEW = { reports: [], venues: [], hidden: [], prices: [] };

/** Simulates /api/admin/*; `coverage` can be replaced per request, `delayMs` keeps a calculation in flight. */
async function fakeAdmin(page: Page, options: { delayMs?: number } = {}) {
  const state = {
    requests: 0,
    next: (): { status?: number; body?: unknown; html?: boolean } => ({ body: COVERAGE }),
  };
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/admin/coverage") {
      await route.fulfill({ json: EMPTY_OVERVIEW });
      return;
    }
    state.requests += 1;
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    const answer = state.next();
    if (answer.html) {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" });
      return;
    }
    await route.fulfill({ status: answer.status ?? 200, json: answer.body });
  });
  return state;
}

const refresh = (page: Page) => page.getByRole("button", { name: "Aggiorna" });
const rowOf = (page: Page, name: string) => page.getByRole("row", { name: new RegExp(name) });

test("nothing is calculated until the button is pressed (M5-14)", async ({ page, context }) => {
  const admin = await fakeAdmin(page);
  await page.clock.install();
  await page.goto("/admin");
  await expect(page.getByText("Premi Aggiorna per calcolare lo stato della mappa")).toBeVisible();
  expect(admin.requests).toBe(0);

  await page.clock.runFor("05:00"); // five minutes with the page open
  expect(admin.requests).toBe(0);

  // Another tab in front, then back: no calculation on return either.
  const other = await context.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  await page.bringToFront();
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForTimeout(300);
  expect(admin.requests).toBe(0);
  await other.close();
});

test("one press is one request, a double tap too (M5-14)", async ({ page }) => {
  const admin = await fakeAdmin(page, { delayMs: 400 });
  await page.goto("/admin");
  await refresh(page).dblclick();
  await expect(page.getByText(/Aggiornato alle \d{2}:\d{2}:\d{2}/)).toBeVisible();
  expect(admin.requests).toBe(1);
  await refresh(page).click();
  await expect(refresh(page)).toBeEnabled();
  expect(admin.requests).toBe(2);
});

test("indicators, gate and the table per city (M5-15)", async ({ page }) => {
  const admin = await fakeAdmin(page);
  await page.goto("/admin");
  await refresh(page).click();

  const stats = page.getByTestId("coverage-stats");
  await expect(stats).toContainText("17"); // bars with a price
  await expect(stats).toContainText("2"); // cities with a covered bar
  await expect(stats).toContainText("48"); // public prices
  await expect(page.getByTestId("coverage-gate")).toContainText("12 su 150");

  const milano = rowOf(page, "Milano");
  await expect(milano).toContainText("12");
  await expect(milano).toContainText("1947"); // all the OSM bars of the city
  await expect(milano).toContainText("0,6 %");
  await expect(milano).toContainText("12 ott 2026");
  await expect(rowOf(page, "Senza città")).toContainText("2");

  // Search and sort work on the data already downloaded: no new request.
  await page.getByRole("searchbox", { name: "Filtra l'elenco" }).fill("sesto");
  await expect(rowOf(page, "Sesto San Giovanni")).toBeVisible();
  await expect(rowOf(page, "Milano")).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Filtra l'elenco" }).fill("");
  // The sort is a select (the minor columns are hidden on a phone); the column header says so.
  await page
    .getByRole("combobox", { name: "Ordina per" })
    .selectOption({ label: "Prezzi pubblici" });
  await expect(page.locator("th[aria-sort]")).toHaveText(/Prezzi pubblici/);
  await expect(page.locator("th[aria-sort]")).toHaveAttribute("aria-sort", "descending");
  await expect(page.locator("tbody tr").first()).toContainText("Milano");
  await page.getByRole("button", { name: "Decrescente" }).click();
  await expect(page.locator("th[aria-sort]")).toHaveAttribute("aria-sort", "ascending");
  await expect(page.locator("tbody tr").first()).toContainText("Sesto San Giovanni");
  await expect(rowOf(page, "Rozzano")).toHaveCount(0); // no price there: hidden by default
  await page.getByRole("checkbox", { name: "Mostra anche le città senza prezzi" }).check();
  await expect(rowOf(page, "Rozzano")).toBeVisible();
  expect(admin.requests).toBe(1);
});

test("a failed or non-JSON answer keeps the previous data (M5-15)", async ({ page }) => {
  const admin = await fakeAdmin(page);
  await page.goto("/admin");
  await refresh(page).click();
  await expect(rowOf(page, "Milano")).toBeVisible();

  admin.next = () => ({ html: true }); // the free daily limit is over: HTML instead of JSON
  await refresh(page).click();
  await expect(page.getByRole("alert")).toContainText("Aggiornamento non riuscito, riprova");
  await expect(rowOf(page, "Milano")).toBeVisible();

  admin.next = () => ({ status: 429, body: { error: { code: "rate_limited", message: "x" } } });
  await refresh(page).click();
  await expect(page.getByRole("alert")).toContainText("Hai appena aggiornato");
  await expect(rowOf(page, "Milano")).toBeVisible();

  admin.next = () => ({ body: COVERAGE });
  await refresh(page).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("the cost warning appears above 80 % of the threshold (ADR 0022)", async ({ page }) => {
  const admin = await fakeAdmin(page);
  await page.goto("/admin");
  await refresh(page).click();
  await expect(page.getByText("si avvicina al limite di costo")).toHaveCount(0);
  admin.next = () => ({ body: { ...COVERAGE, active: 4001 } });
  await refresh(page).click();
  await expect(page.getByText("si avvicina al limite di costo")).toBeVisible();
});

test("a city row opens the map on that city", async ({ page }) => {
  await fakeAdmin(page);
  await page.goto("/admin");
  await refresh(page).click();
  await rowOf(page, "Milano")
    .getByRole("link", { name: /Milano/ })
    .click();
  await expect(page).toHaveURL(/\/\?at=45\.46\d+,9\.18\d+/);
  await waitForBars(page);
  expect(await zoomOf(page)).toBeGreaterThanOrEqual(13);
});

test("phone layout, targets and accessibility in every state (M5-15)", async ({ page }) => {
  await fakeAdmin(page, { delayMs: 600 });
  await page.goto("/admin");
  await expect(refresh(page)).toBeVisible();

  const noOverflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const axe = async () => {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations).toEqual([]);
  };

  // "Aggiorna" is on screen without scrolling, and big enough to tap.
  const box = await refresh(page).boundingBox();
  expect(box && box.y + box.height <= 844).toBe(true);
  expect(box?.height).toBeGreaterThanOrEqual(48);
  expect(box?.width).toBeGreaterThanOrEqual(48);
  expect(await noOverflow()).toBe(true);
  await axe();
  await page.screenshot({ path: "docs/screenshots/admin/coverage-initial.png" });

  await refresh(page).click();
  await expect(refresh(page)).toBeDisabled();
  await expect(page.getByTestId("coverage-section")).toHaveAttribute("aria-busy", "true");
  await page.screenshot({ path: "docs/screenshots/admin/coverage-loading.png" });

  await expect(rowOf(page, "Milano")).toBeVisible();
  expect(await noOverflow()).toBe(true);
  // Every control of the section is a 48 px target (WCAG 2.2 and the design system).
  const controls = page
    .getByTestId("coverage-section")
    .locator("button, input[type=search], label:has(input[type=checkbox]), th a, td a");
  for (const control of await controls.all()) {
    const size = await control.boundingBox();
    expect(size?.height).toBeGreaterThanOrEqual(48);
  }
  await axe();
  await page.screenshot({ path: "docs/screenshots/admin/coverage-data.png", fullPage: true });
});

test("the error state, as a screenshot", async ({ page }) => {
  const admin = await fakeAdmin(page);
  admin.next = () => ({ html: true });
  await page.goto("/admin");
  await refresh(page).click();
  await expect(page.getByRole("alert")).toContainText("Aggiornamento non riuscito");
  await page.screenshot({ path: "docs/screenshots/admin/coverage-error.png" });
});
