import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The Worker side (Access JWT, hide, add, review) is covered in tests/worker/admin.test.ts.
// Here the admin API is simulated: locally there is no Cloudflare Access in front of it.

const OVERVIEW = {
  venues: [
    {
      id: 3,
      name: "Bar Nuovo",
      kind: 1,
      lat: 45.4642,
      lon: 9.19,
      cell: "u0nd9",
      status: "pending",
      confirmations: 1,
    },
  ],
  hidden: [
    { venue_key: "n7953838530", cell: "u0nd9", name: "Terrazza Duomo 21", day: "2026-10-11" },
  ],
  prices: [
    {
      venue_key: "n2420779240",
      drink: "spritz",
      size_ml: 0,
      hh: 0,
      cell: "u0nd9",
      price_cents: 2000,
      observed_on: "2026-10-12",
      confirmations: 0,
      status: "review",
      source: "manual",
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
      await route.fulfill({ json: OVERVIEW });
      return;
    }
    posts.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() });
    await route.fulfill({ json: { status: "ok" } });
  });
  return posts;
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
  await page.getByLabel("Città").fill("milano");
  await page.getByLabel("Nome del bar").first().fill("camparino");
  await page.getByRole("button", { name: "Cerca" }).click();
  const found = page.getByRole("listitem").filter({ hasText: "Camparino in Galleria" });
  await found.getByRole("button", { name: "Nascondi" }).click();
  await expect.poll(() => posts.map((p) => p.path)).toContain("/api/admin/hide");
  expect(posts.find((p) => p.path === "/api/admin/hide")?.body).toEqual({
    venue: "n13001337602",
    cell: "u0nd9",
  });

  // Add a missing bar from pasted coordinates.
  await page.getByLabel("Nome del bar").nth(1).fill("Bar Mancante");
  await page.getByLabel("Tipo").selectOption({ label: "Pub" });
  await page.getByLabel("Coordinate (latitudine, longitudine)").fill("45.4651, 9.1882");
  await page.getByRole("button", { name: "Aggiungi" }).click();
  await expect
    .poll(() => posts.find((p) => p.path === "/api/admin/venues")?.body)
    .toEqual({ name: "Bar Mancante", kind: 2, lat: 45.4651, lon: 9.1882 });

  await expect(page.getByRole("status")).toContainText("Bar aggiunto");

  // Coordinates outside Italy are refused before any request.
  const before = posts.length;
  await page.getByLabel("Nome del bar").nth(1).fill("Bar Parigi");
  await page.getByLabel("Coordinate (latitudine, longitudine)").fill("48.85, 2.35");
  await page.getByRole("button", { name: "Aggiungi" }).click();
  await expect(page.getByRole("status")).toContainText("fuori dall'Italia");
  expect(posts.length).toBe(before);

  // Review queues.
  const price = page.getByRole("listitem").filter({ hasText: "20,00 €" });
  await price.getByRole("button", { name: "Rimuovi" }).click();
  await expect
    .poll(() => posts.find((p) => p.path === "/api/admin/prices/status")?.body)
    .toEqual({ venue: "n2420779240", drink: "spritz", size_ml: 0, hh: 0, status: "removed" });
  await page
    .getByRole("listitem")
    .filter({ hasText: "Bar Nuovo" })
    .getByRole("button", { name: "Approva" })
    .click();
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
