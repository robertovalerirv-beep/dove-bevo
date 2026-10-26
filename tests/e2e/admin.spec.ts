import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { atHour, THEME_HOURS } from "./helpers";

// The Worker side (Access JWT, hide, add, review) is covered in tests/worker/admin.test.ts.
// Here the admin API is simulated: locally there is no Cloudflare Access in front of it.

const OVERVIEW = {
  reports: [
    {
      venue_key: "n5471678323",
      cell: "u0nd9",
      reasons: "not_exists,closed",
      n: 2,
      day: "2026-10-12",
      status: "visible",
    },
    {
      venue_key: "w549495264",
      cell: "u0nd9",
      reasons: "wrong_info",
      n: 1,
      day: "2026-10-11",
      status: "visible",
    },
  ],
  venues: [
    {
      id: 3,
      name: "Bar Nuovo",
      kind: 1,
      lat: 45.4642,
      lon: 9.19,
      cell: "u0nd9",
      status: "pending",
      confirmations: 2,
      day: "2026-10-13",
      prices: 1,
    },
  ],
  hidden: [
    { venue_key: "n7953838530", cell: "u0nd9", name: "Terrazza Duomo 21", day: "2026-10-11" },
  ],
  prices: [
    {
      venue_key: "n2420779240",
      drink: "spritz",
      hh: 0,
      cell: "u0nd9",
      price_cents: 2000,
      observed_on: "2026-10-12",
      confirmations: 0,
      status: "review",
      n: 0,
      reasons: null,
      report_day: null,
      source: "manual",
    },
  ],
};

const METRICS = {
  days: [
    {
      day: "2026-10-21",
      opens: 20,
      returning: 5,
      added: 7,
      confirmed: 3,
      viewed: 31,
      contributed: 4,
    },
    {
      day: "2026-10-20",
      opens: 10,
      returning: 0,
      added: 0,
      confirmed: 1,
      viewed: 12,
      contributed: 0,
    },
  ],
};

async function fakeAdmin(page: Page, allowed = true) {
  const posts: { path: string; body: unknown }[] = [];
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    if (!allowed) {
      await route.fulfill({ status: 403, json: { error: { code: "forbidden", message: "x" } } });
      return;
    }
    if (request.method() === "GET") {
      const metrics = new URL(request.url()).pathname === "/api/admin/metrics";
      await route.fulfill({ json: metrics ? METRICS : OVERVIEW });
      return;
    }
    posts.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() });
    await route.fulfill({ json: { status: "ok" } });
  });
  return posts;
}

for (const scheme of ["light", "dark"] as const) {
  test(`a first reported active price shows evidence and supports review, remove and dismiss (${scheme})`, async ({
    page,
  }, testInfo) => {
    const posts = await fakeAdmin(page);
    const reported = {
      ...OVERVIEW.prices[0],
      status: "active",
      n: 1,
      reasons: "offensive",
      report_day: "2026-10-26",
    };
    await page.route("**/api/admin/overview", (route) =>
      route.fulfill({
        json: { ...OVERVIEW, prices: [reported] },
      }),
    );
    await atHour(page, THEME_HOURS[scheme]);
    await page.goto("/admin");
    await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
    const queue = page.locator("#price-review");
    await expect(queue).toContainText("Contenuto offensivo");
    await expect(queue).toContainText("1 segnalazione");
    await expect(queue).toContainText("26 ott");
    await expect(queue).toContainText("Pubblico");
    await queue.getByRole("button", { name: "Metti in revisione" }).click();
    await expect
      .poll(() => posts.at(-1)?.body)
      .toEqual({ venue: "n2420779240", drink: "spritz", hh: 0, status: "review" });
    await queue.getByRole("button", { name: "Rimuovi" }).click();
    await expect
      .poll(() => posts.at(-1)?.body)
      .toEqual({ venue: "n2420779240", drink: "spritz", hh: 0, status: "removed" });
    await queue.getByRole("button", { name: "Ignora segnalazioni" }).click();
    await expect
      .poll(() => posts.at(-1))
      .toEqual({
        path: "/api/admin/reports/dismiss",
        body: { venue: "n2420779240", drink: "spritz", hh: 0 },
      });
    await expect(queue.getByRole("button", { name: "Metti in revisione" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const button of await queue.getByRole("button").all()) {
      const box = await button.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(48);
      expect(box?.height).toBeGreaterThanOrEqual(48);
    }
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await queue.screenshot({ path: testInfo.outputPath(`price-moderation-${scheme}.png`) });
  });
}

test("without Cloudflare Access the admin page says it is reserved", async ({ page }) => {
  await fakeAdmin(page, false);
  await page.goto("/admin");
  await expect(page.getByRole("alert")).toContainText("Accesso riservato");
});

test("admin: find and hide a non-bar, add a missing bar, decide reviews", async ({ page }) => {
  const posts = await fakeAdmin(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Amministrazione" })).toBeVisible();

  // Find a bar of the fixture by city and name, then hide it.
  await page.getByLabel("Città", { exact: true }).fill("milano");
  await page.getByLabel("Nome del bar").nth(1).fill("camparino");
  await page.getByRole("button", { name: "Cerca" }).click();
  const found = page.getByRole("listitem").filter({ hasText: "Camparino in Galleria" });
  page.once("dialog", (d) => void d.accept()); // "Eliminare … dalla mappa?"
  await found.getByRole("button", { name: "Elimina dalla mappa" }).click();
  await expect.poll(() => posts.map((p) => p.path)).toContain("/api/admin/hide");
  expect(posts.find((p) => p.path === "/api/admin/hide")?.body).toEqual({
    venue: "n13001337602",
    cell: "u0nd9",
  });

  // Add a missing bar from pasted coordinates.
  await page.getByLabel("Nome del bar").nth(2).fill("Bar Mancante");
  await page.getByLabel("Tipo").nth(1).selectOption({ label: "Pub" });
  await page.getByLabel("Coordinate (latitudine, longitudine)").fill("45.4651, 9.1882");
  await page.getByRole("button", { name: "Aggiungi" }).click();
  await expect
    .poll(() => posts.find((p) => p.path === "/api/admin/venues")?.body)
    .toEqual({ name: "Bar Mancante", kind: 2, lat: 45.4651, lon: 9.1882 });

  await expect(page.getByRole("status")).toContainText("Bar aggiunto");

  // Coordinates outside Italy are refused before any request.
  const before = posts.length;
  await page.getByLabel("Nome del bar").nth(2).fill("Bar Parigi");
  await page.getByLabel("Coordinate (latitudine, longitudine)").fill("48.85, 2.35");
  await page.getByRole("button", { name: "Aggiungi" }).click();
  await expect(page.getByRole("status")).toContainText("fuori dall'Italia");
  expect(posts.length).toBe(before);

  // Review queues.
  const price = page.getByRole("listitem").filter({ hasText: "20,00 €" });
  await price.getByRole("button", { name: "Rimuovi" }).click();
  await expect
    .poll(() => posts.find((p) => p.path === "/api/admin/prices/status")?.body)
    .toEqual({ venue: "n2420779240", drink: "spritz", hh: 0, status: "removed" });
  await page.locator("#new-bars").getByRole("button", { name: "Approva" }).click();
  await expect.poll(() => posts.map((p) => p.path)).toContain("/api/admin/venues/3/status");
  await page
    .getByRole("listitem")
    .filter({ hasText: "Terrazza Duomo 21" })
    .getByRole("button", { name: "Ripristina" })
    .click();
  await expect.poll(() => posts.map((p) => p.path)).toContain("/api/admin/unhide");

  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: "docs/screenshots/admin/admin.png", fullPage: true });
});

test("admin search also finds bars added by hand, fresh, and accepts a bar link", async ({
  page,
}) => {
  const posts = await fakeAdmin(page);
  // The cell now holds a bar added a moment ago (user bar "u9").
  await page.route("**/api/prices/u0nd9", async (route) => {
    try {
      const response = await route.fetch();
      const body = (await response.json()) as { u: unknown[] };
      body.u = [...body.u, ["u9", "Bar Appena Creato", 1, 45.4643, 9.1901]];
      await route.fulfill({ response, json: body });
    } catch {
      // The test ended and closed the page while this request was still in flight.
    }
  });
  await page.goto("/admin");
  await page.getByLabel("Città", { exact: true }).fill("Milano");
  await page.getByLabel("Nome del bar").nth(1).fill("appena creato");
  await page.getByRole("button", { name: "Cerca" }).click();
  const added = page
    .getByRole("listitem")
    .filter({ hasText: "Bar Appena Creato" })
    .filter({ hasText: "Aggiunto da te" });
  await expect(added).toContainText("Aggiunto da te");
  page.once("dialog", (d) => void d.accept());
  await added.getByRole("button", { name: "Elimina dalla mappa" }).click();
  await expect
    .poll(() => posts.find((p) => p.path === "/api/admin/venues/9/status")?.body)
    .toEqual({ status: "removed" });

  // A link copied from the bar page finds exactly that bar.
  await page.getByLabel("Città", { exact: true }).fill("");
  await page.getByLabel("Nome del bar").nth(1).fill("");
  await page
    .getByLabel("Oppure il link della scheda del bar")
    .fill("https://dovebevo.example/bar/n2420779240?c=u0nd9");
  await page.getByRole("button", { name: "Cerca" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Bistrot Duomo" })).toHaveCount(1);
});

test("admin decides on bar reports: delete or ignore, never automatic", async ({ page }) => {
  const posts = await fakeAdmin(page);
  await page.goto("/admin");
  const reported = page.getByRole("listitem").filter({ hasText: "Terrazza Aperol" });
  await expect(reported).toContainText("Bar inesistente, Bar chiuso definitivamente");
  await expect(reported).toContainText("2 segnalazioni");
  page.once("dialog", (d) => void d.accept());
  await reported.getByRole("button", { name: "Elimina dalla mappa" }).click();
  await expect
    .poll(() => posts.find((p) => p.path === "/api/admin/hide")?.body)
    .toEqual({ venue: "n5471678323", cell: "u0nd9" });
  await page
    .getByRole("listitem")
    .filter({ hasText: "Motta" })
    .filter({ hasText: "Nome o indirizzo errato" })
    .getByRole("button", { name: "Ignora" })
    .click();
  await expect
    .poll(() => posts.find((p) => p.path === "/api/admin/reports/dismiss")?.body)
    .toEqual({ venue: "w549495264" });
});

test("M3-14 three queues with counters; a proposed bar is public only if the admin approves", async ({
  page,
}) => {
  const posts = await fakeAdmin(page);
  await page.goto("/admin");
  await expect(page.getByTestId("admin-total")).toHaveText("4 da fare"); // 1 new + 2 reports + 1 price
  await expect(page.getByTestId("count-new-bars")).toHaveText("1");
  await expect(page.getByTestId("count-bar-reports")).toHaveText("2");
  await expect(page.getByTestId("count-price-review")).toHaveText("1");

  const proposed = page.locator("#new-bars");
  await expect(proposed).toContainText("Proposto da 2 persone");
  await expect(proposed).toContainText("1 prezzo in attesa");
  await expect(proposed.getByRole("link", { name: "Cerca su Google Maps" })).toHaveAttribute(
    "href",
    /google\.com\/maps\/search\/\?api=1&query=Bar%20Nuovo/,
  );

  // Fix the name, then approve: the fix travels with the decision.
  await proposed.getByLabel("Nome del bar").fill("Bar Nuovo Giusto");
  await proposed.getByRole("button", { name: "Approva" }).click();
  await expect
    .poll(() => posts.find((p) => p.path === "/api/admin/venues/3/status")?.body)
    .toEqual({ status: "approved", name: "Bar Nuovo Giusto" });

  // Reject asks first; nothing happens if the admin says no.
  const before = posts.length;
  page.once("dialog", (d) => void d.dismiss());
  await proposed.getByRole("button", { name: "Rifiuta" }).click();
  expect(posts.length).toBe(before);
  page.once("dialog", (d) => void d.accept());
  await proposed.getByRole("button", { name: "Rifiuta" }).click();
  await expect
    .poll(() => posts.filter((p) => p.path === "/api/admin/venues/3/status").at(-1)?.body)
    .toEqual({ status: "removed" });
});

test("M5-03 daily metrics: one line per day, no person, readable", async ({ page }) => {
  await fakeAdmin(page);
  await page.goto("/admin");
  const section = page.getByTestId("metrics-section");
  await expect(section.getByRole("heading", { name: "Uso giorno per giorno" })).toBeVisible();
  const table = section.getByRole("table");
  const row = table.getByRole("row").filter({ hasText: "21 ott" });
  await expect(row).toContainText("20"); // visits
  await expect(row).toContainText("25%"); // returning: 5 of 20
  await expect(row).toContainText("7"); // prices added
  await expect(row).toContainText("20%"); // visits with a contribution: 4 of 20
  await expect(table.getByRole("row").filter({ hasText: "20 ott" })).toContainText("0%");
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await section.screenshot({ path: "docs/screenshots/admin/metrics.png" });
});

test("M5-03 metrics that fail to load leave the rest of the admin page working", async ({
  page,
}) => {
  await fakeAdmin(page);
  await page.route("**/api/admin/metrics", (route) => route.fulfill({ status: 500, body: "x" }));
  await page.goto("/admin");
  await expect(page.getByTestId("metrics-section")).toContainText("Non riesco a leggere");
  await expect(page.getByTestId("admin-total")).toHaveText("4 da fare");
});

test("admin: price list entry for a bar found by city and name (M3-17)", async ({ page }) => {
  const posts = await fakeAdmin(page);
  await page.route("**/api/admin/listino", async (route) => {
    posts.push({ path: "/api/admin/listino", body: route.request().postDataJSON() });
    await route.fulfill({ json: { results: [{ status: "active" }, { status: "skipped" }] } });
  });
  await page.goto("/admin");
  await page.getByLabel("Città", { exact: true }).fill("milano");
  await page.getByLabel("Nome del bar").nth(1).fill("camparino");
  await page.getByRole("button", { name: "Cerca" }).click();
  const found = page.getByRole("listitem").filter({ hasText: "Camparino in Galleria" });
  await found.getByRole("button", { name: "Inserisci listino" }).click();

  // Nothing typed, then a price outside the limits: refused before any request.
  await found.getByRole("button", { name: "Salva i prezzi" }).click();
  await expect(found.getByRole("status")).toContainText("almeno un prezzo");
  await found.getByLabel("Spritz (€)", { exact: true }).fill("90");
  await found.getByRole("button", { name: "Salva i prezzi" }).click();
  await expect(found.getByRole("status")).toContainText("fuori dai limiti");
  expect(posts.some((p) => p.path === "/api/admin/listino")).toBe(false);

  await found.getByLabel("Spritz (€)", { exact: true }).fill("7,50");
  await found.getByLabel("Acqua (€)", { exact: true }).fill("3");
  await found.getByLabel("Giorno in cui li hai visti").fill("2026-10-20");
  await found.getByRole("button", { name: "Salva i prezzi" }).click();
  await expect(found.getByRole("status")).toContainText("1 prezzo salvato, 1 non cambiati");
  const body = posts.find((p) => p.path === "/api/admin/listino")?.body as {
    venue: string;
    cell: string;
    observed_on: string;
    items: unknown[];
  };
  expect(body).toMatchObject({ venue: "n13001337602", cell: "u0nd9", observed_on: "2026-10-20" });
  expect(body.items).toEqual([
    { drink: "spritz", hh: 0, price_cents: 750 },
    { drink: "water", hh: 0, price_cents: 300 },
  ]);

  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
});
