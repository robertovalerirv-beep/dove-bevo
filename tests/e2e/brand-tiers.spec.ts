import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { chooseDrinks, goToMilano, mapRegion } from "./helpers";

// F5a: colours on the median (M4-03), freshness (M4-05), happy hour (M4-10). Read-only.
// Seed (tests/fixtures/seed.sql): five wine prices 4,00 · 4,50 · 5,00 · 5,50 · 9,00 in cell u0nd9.

test("M4-03 with five prices the legend appears and the pins are drawn; with fewer it does not", async ({
  page,
}, info) => {
  await page.goto("/");
  await goToMilano(page);
  const legend = page.getByRole("list", { name: "Legenda dei prezzi" });
  await expect(legend).toHaveCount(0); // spritz: two prices only
  await chooseDrinks(page, "Calice di vino");
  await expect(legend).toBeVisible();
  await expect(legend.getByRole("listitem")).toHaveText(["↓ Affare", "= Giusto", "↑ Salato"]);
  // The value is always written on the pin, whatever its tier (MapLibre may hide overlapping pins).
  await expect(mapRegion(page)).toHaveAttribute("data-prices-shown", /9,00 €/, {
    timeout: 20_000,
  });
  await page.screenshot({ path: info.outputPath("m4-03-mediana.png") });
  await chooseDrinks(page, "Spritz");
  await expect(legend).toHaveCount(0);
});

test("M4-05 a price older than 90 days says «Da confermare» on the bar page", async ({ page }) => {
  await page.goto("/bar/n11755824793?c=u0nd9");
  const sheet = page.getByRole("dialog", { name: "Le Jardin Bistrot" });
  const old = sheet.getByRole("listitem").filter({ hasText: "Gin lemon" });
  await expect(old).toContainText("Da confermare");
  const wine = sheet.getByRole("listitem").filter({ hasText: "Calice di vino" });
  await expect(wine).not.toContainText("Da confermare"); // 4 days old
});

test("M4-10 happy hour: only the HH price is shown with «HH» on the map; the bar page shows both", async ({
  page,
}) => {
  await page.goto("/");
  await goToMilano(page);
  await chooseDrinks(page, "Spritz");
  await page.getByRole("button", { name: "Elenco" }).click();
  const list = page.getByRole("dialog", { name: "Bar nella zona" });
  await expect(list.getByRole("link", { name: /Terrazza Aperol/ })).toContainText("10,00 € HH");
  await page.goto("/bar/n5471678323?c=u0nd9"); // Terrazza Aperol: HH spritz only in the seed
  const sheet = page.getByRole("dialog", { name: "Terrazza Aperol" });
  await expect(sheet.getByRole("listitem").filter({ hasText: "Spritz" })).toContainText("HH");
});
