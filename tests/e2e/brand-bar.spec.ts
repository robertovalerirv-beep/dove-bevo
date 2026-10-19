import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { goToMilano } from "./helpers";

// MB-09: the bar page is a receipt. Read-only: the seeded prices are only looked at.
const CAMPARINO = "/bar/n13001337602?c=u0nd9";

test("MB-09 the receipt: rows with icon, date and confirmations; no inline style in the HTML", async ({
  page,
}, info) => {
  const html = await (await page.request.get(CAMPARINO)).text();
  expect(html).not.toMatch(/\sstyle=/i);

  await page.goto(CAMPARINO);
  const sheet = page.getByRole("dialog", { name: "Camparino in Galleria" });
  const rows = sheet.getByRole("listitem").filter({ has: page.locator(".price__icon svg") });
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Spritz" })).toContainText("12,00 €");
  await expect(rows.filter({ hasText: "Spritz" }).locator(".price__meta")).toContainText(
    /\d{1,2} \w{3} \d{4} · 1 conferma/,
  );
  for (const name of ["Confermo", "È cambiato", "Segnala un errore"])
    await expect(rows.first().getByRole("button", { name })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Indicazioni" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("mb-09-scontrino.png") });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("MB-09 at most five rows, then «Vedi tutti»", async ({ page }) => {
  const day = new Date().toISOString().slice(0, 10);
  const drinks = [
    "spritz",
    "gin_tonic",
    "negroni",
    "wine_glass",
    "prosecco",
    "alcohol_free",
    "soft_drink",
  ];
  await page.route("**/api/venues/n13001337602/prices", (route) =>
    route.fulfill({
      contentType: "application/json",
      json: {
        p: drinks.map((d, i) => [
          "n13001337602",
          d,
          d === "soft_drink" ? 330 : d === "wine_glass" || d === "prosecco" ? 150 : 0,
          0,
          500 + i * 50,
          day,
          i,
          0,
        ]),
        h: [],
      },
    }),
  );
  await page.goto(CAMPARINO);
  const sheet = page.getByRole("dialog", { name: "Camparino in Galleria" });
  const rows = sheet.locator("ul.prices > li");
  await expect(rows).toHaveCount(5);
  await sheet.getByRole("button", { name: "Vedi tutti (7)" }).click();
  await expect(rows).toHaveCount(7);
  await expect(sheet.getByRole("button", { name: "Mostra meno" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

test("MB-09 the drink chosen on the map comes first", async ({ page }) => {
  await page.goto("/");
  await goToMilano(page);
  await page.getByRole("group", { name: "Drink" }).getByRole("button", { name: "Spritz" }).click();
  await page.getByRole("button", { name: "Elenco" }).click();
  await page
    .getByRole("dialog", { name: "Bar nella zona" })
    .getByRole("link", { name: /Camparino/ })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Camparino in Galleria" }).locator("ul.prices > li").first(),
  ).toContainText("Spritz");
});
