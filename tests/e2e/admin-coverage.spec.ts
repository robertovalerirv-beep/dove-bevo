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
  none: [0, 0, ""],
  users: [[MILANO, 20]], // approved user bars of the city: they join the total
  members: [],
};
// Milano as the list tests need it: the three bars of the e2e seed that have a public price.
const LIST = {
  ...COVERAGE,
  bars: 3,
  prices: 5,
  cities: [[MILANO, 3, 5, "2026-10-12"]],
  members: [
    [MILANO, "n2420779240", "u0nd9"],
    [MILANO, "n13001337602", "u0nd9"],
    [MILANO, "n5471678323", "u0nd9"],
  ],
};
const EMPTY_OVERVIEW = { reports: [], venues: [], hidden: [], prices: [] };

/** Simulates /api/admin/*; `coverage` can be replaced per request, `delayMs` keeps a calculation in flight. */
async function fakeAdmin(page: Page, options: { delayMs?: number } = {}) {
  const state = {
    requests: 0,
    next: (): { status?: number; body?: unknown; html?: boolean; abort?: boolean } => ({
      body: COVERAGE,
    }),
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
    if (answer.abort) {
      await route.abort();
      return;
    }
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
  await expect(milano).toContainText("728"); // the 708 OSM bars of the fixture (cafes are not imported) plus 20 added by hand
  await expect(milano).toContainText("1,6 %");
  await expect(milano).toContainText("12 ott 2026");
  // No orphan row: every bar belongs to a city.
  await expect(rowOf(page, "Senza città")).toHaveCount(0);

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
  await page.getByRole("button", { name: /Inverti l'ordine, ora decrescente/ }).click();
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

  admin.next = () => ({ abort: true }); // the network fails
  await refresh(page).click();
  await expect(page.getByRole("alert")).toContainText("Aggiornamento non riuscito, riprova");
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

test("a city opens the list of its bars with their prices, not the map (M5-15)", async ({
  page,
}) => {
  const admin = await fakeAdmin(page);
  admin.next = () => ({ body: LIST });
  await page.goto("/admin");
  await refresh(page).click();
  await page.getByRole("searchbox", { name: "Filtra l'elenco" }).fill("mil");
  const before = admin.requests;
  await page.getByRole("button", { name: /^Milano/ }).click();

  await expect(page.getByRole("heading", { name: "Milano", level: 3 })).toBeVisible();
  await expect(page.getByText("3 locali con prezzo")).toBeVisible();
  const bars = page.getByTestId("coverage-bars").getByRole("listitem");
  await expect(bars).toHaveCount(3);
  // The names and prices come from the map data, not from the admin API.
  const duomo = bars.filter({ hasText: "Bistrot Duomo" });
  await expect(duomo).toContainText("Spritz");
  await expect(duomo).toContainText("7,50 €");
  await expect(duomo).toContainText("Birra alla spina 0,4 l");
  await expect(duomo).toContainText("6,00 €");
  await expect(bars.filter({ hasText: "Camparino in Galleria" })).toContainText("12,00 €");
  const aperol = bars.filter({ hasText: "Terrazza Aperol" });
  await expect(aperol).toContainText("10,00 €");
  await expect(aperol).toContainText("HH"); // only a happy-hour price
  // Nothing that is not public: the quarantined and the reviewed prices of the seed stay out.
  await expect(page.getByTestId("coverage-bars")).not.toContainText("20,00 €");
  await expect(duomo.getByRole("link", { name: "Apri la scheda" })).toHaveAttribute(
    "href",
    "/bar/n2420779240?c=u0nd9",
  );
  expect(admin.requests).toBe(before); // the tap asks nothing of the admin API

  // The map is still one tap away, as a secondary link.
  await expect(page.getByRole("link", { name: "Vedi sulla mappa" })).toHaveAttribute(
    "href",
    /\/\?at=45\.46\d+,9\.18\d+/,
  );

  // Back: the table is as it was left, and the focus returns to the city.
  await page.getByRole("button", { name: /Tutte le città/ }).click();
  await expect(page.getByRole("searchbox", { name: "Filtra l'elenco" })).toHaveValue("mil");
  await expect(page.getByRole("button", { name: /^Milano/ })).toBeFocused();
});

test("the map link of a city still opens the map on it", async ({ page }) => {
  const admin = await fakeAdmin(page);
  admin.next = () => ({ body: LIST });
  await page.goto("/admin");
  await refresh(page).click();
  await page.getByRole("button", { name: /^Milano/ }).click();
  await page.getByRole("link", { name: "Vedi sulla mappa" }).click();
  await expect(page).toHaveURL(/\/\?at=45\.46\d+,9\.18\d+/);
  await waitForBars(page);
  expect(await zoomOf(page)).toBeGreaterThanOrEqual(13);
});

test("a failed load of the bars says so and can be retried", async ({ page }) => {
  const admin = await fakeAdmin(page);
  admin.next = () => ({ body: LIST });
  await page.route("**/api/prices/u0nd9", (route) => route.abort());
  await page.goto("/admin");
  await refresh(page).click();
  await page.getByRole("button", { name: /^Milano/ }).click();
  await expect(page.getByRole("alert")).toContainText("Non riesco a caricare i locali");
  await page.unroute("**/api/prices/u0nd9");
  await page.getByRole("button", { name: "Riprova" }).click();
  await expect(page.getByRole("heading", { name: "Milano", level: 3 })).toBeFocused();
  await expect(page.getByTestId("coverage-bars").getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("the list on a phone: targets, no sideways scroll, axe (M5-15)", async ({ page }) => {
  const admin = await fakeAdmin(page);
  admin.next = () => ({ body: LIST });
  await page.goto("/admin");
  await refresh(page).click();
  await page.getByRole("button", { name: /^Milano/ }).click();
  await expect(page.getByTestId("coverage-bars").getByRole("listitem")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  for (const control of await page
    .getByTestId("coverage-section")
    .locator("button:visible, a:visible")
    .all()) {
    const size = await control.boundingBox();
    expect(size?.height).toBeGreaterThanOrEqual(48);
  }
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.screenshot({ path: "docs/screenshots/admin/coverage-city-list.png", fullPage: true });
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
  await expect(page.getByText("Calcolo in corso")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/admin/coverage-loading.png" });

  await expect(rowOf(page, "Milano")).toBeVisible();
  expect(await noOverflow()).toBe(true);
  // Every control of the section is a 48 px target (WCAG 2.2 and the design system).
  const controls = page
    .getByTestId("coverage-section")
    .locator("button, input[type=search], label:has(input[type=checkbox]), th a, td a, th button");
  for (const control of await controls.all()) {
    const size = await control.boundingBox();
    expect(size?.height).toBeGreaterThanOrEqual(48);
  }
  // A short city name is still a 48 px wide target.
  for (const city of await page.locator(".cov__city").all()) {
    expect((await city.boundingBox())?.width).toBeGreaterThanOrEqual(48);
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

test("keyboard focus stays on the button while and after it calculates (WCAG 2.4.3)", async ({
  page,
}) => {
  await fakeAdmin(page, { delayMs: 300 });
  await page.goto("/admin");
  await refresh(page).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Calcolo in corso")).toBeVisible();
  await expect(refresh(page)).toBeFocused();
  await expect(rowOf(page, "Milano")).toBeVisible();
  await expect(refresh(page)).toBeFocused();
});

test("a bar the Worker could not place stays visible in 'Senza città' (degraded case)", async ({
  page,
}) => {
  const admin = await fakeAdmin(page);
  admin.next = () => ({ body: { ...COVERAGE, none: [2, 3, "2026-10-10"] } });
  await page.goto("/admin");
  await refresh(page).click();
  await expect(rowOf(page, "Senza città")).toContainText("2");
});

test("the bars without a city open as a list too, and a new calculation refreshes an open list", async ({
  page,
}) => {
  const admin = await fakeAdmin(page);
  admin.next = () => ({
    body: {
      ...LIST,
      none: [1, 2, "2026-10-10"],
      members: [...LIST.members, [0, "w549495264", "u0nd9"]],
    },
  });
  await page.goto("/admin");
  await refresh(page).click();
  await page.getByRole("button", { name: "Senza città" }).click();
  await expect(page.getByText("1 locale con prezzo")).toBeVisible();
  await expect(page.getByTestId("coverage-bars").getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Vedi sulla mappa" })).toHaveCount(0); // no city, no map

  // Back to the table, into Milano, then a new calculation while the list is open.
  await page.getByRole("button", { name: /Tutte le città/ }).click();
  await expect(page.getByRole("button", { name: "Senza città" })).toBeFocused();
  await page.getByRole("button", { name: /^Milano/ }).click();
  await expect(page.getByText("3 locali con prezzo")).toBeVisible();
  admin.next = () => ({ body: { ...LIST, members: LIST.members.slice(0, 2) } });
  await refresh(page).click();
  await expect(page.getByText("2 locali con prezzo")).toBeVisible();
  await expect(page.getByTestId("coverage-bars").getByRole("listitem")).toHaveCount(2);
});
