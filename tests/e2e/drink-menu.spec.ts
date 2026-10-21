import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { test } from "./fixtures";
import {
  chooseDrinks,
  DRINK_NAMES,
  drinkList,
  atHour,
  drinkMenuButton,
  goToMilano,
  mapRegion,
  openDrinkMenu,
  THEME_HOURS,
} from "./helpers";

// MC-01 / MC-02 (SPEC 1.6): one button «Scegli cosa bere» opens a list of check boxes; the map shows the
// bars with at least one of the chosen drinks, each at its cheapest. Read-only, on the seed:
// Bistrot Duomo spritz 7,50 + beer 6,00 · Camparino spritz 12,00 + beer 9,00 · Terrazza Aperol spritz HH 10,00.

test("MC-01 one button instead of the row of chips, closed at the start", async ({ page }) => {
  await page.goto("/");
  const button = drinkMenuButton(page);
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(drinkList(page)).toBeHidden();
  await expect(page.getByTestId("drink-summary")).toHaveText("Birra media");
  // No row of chips left to scroll: the header holds the button only.
  expect(await page.locator(".top .chip").count()).toBe(1);
  expect(await page.locator(".chips").count()).toBe(0);
});

test("MC-01 the list has the nine drinks of the catalog and opens and closes from the keyboard", async ({
  page,
}) => {
  await page.goto("/");
  const button = drinkMenuButton(page);
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const labels = (await drinkList(page).locator("label").allTextContents()).map((t) => t.trim());
  expect(labels).toEqual([...DRINK_NAMES]);
  await expect(drinkList(page).getByRole("checkbox", { name: "Birra media" })).toBeChecked();
  // Escape closes the list and gives the focus back to the button.
  await page.keyboard.press("Escape");
  await expect(drinkList(page)).toBeHidden();
  await expect(button).toBeFocused();
  // A tap outside closes it too.
  await button.click();
  await expect(drinkList(page)).toBeVisible();
  await page.mouse.click(30, 760); // on the map, below the list
  await expect(drinkList(page)).toBeHidden();
});

test("MC-01 the last check cannot be removed: the map always has a drink", async ({ page }) => {
  await page.goto("/");
  await openDrinkMenu(page);
  const beer = drinkList(page).getByRole("checkbox", { name: "Birra media" });
  await expect(beer).toHaveAttribute("aria-disabled", "true");
  await drinkList(page).locator("label", { hasText: "Birra media" }).click({ force: true }); // aria-disabled: not "enabled" for Playwright, but a person can tap it
  await expect(beer).toBeChecked();
  await drinkList(page).locator("label", { hasText: "Spritz" }).click();
  await expect(beer).not.toHaveAttribute("aria-disabled", "true"); // two checked: either can go
});

test("MC-01 targets of 48 px, no sizes in the names, axe clean with the list open", async ({
  page,
}, info) => {
  await page.goto("/");
  await openDrinkMenu(page);
  if (info.project.name === "chromium")
    await page.screenshot({ path: "docs/screenshots/mc/menu-aperto-390.png" });
  const boxes = [
    await drinkMenuButton(page).boundingBox(),
    ...(await Promise.all(
      (await drinkList(page).locator("label").all()).map((label) => label.boundingBox()),
    )),
  ];
  for (const box of boxes) expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
  await expect(drinkList(page)).not.toContainText(/\d\s?(ml|l)\b/);
  const list = await drinkList(page).boundingBox();
  expect((list?.x ?? 0) + (list?.width ?? 0)).toBeLessThanOrEqual(390); // no sideways scroll
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("MC-02 with several drinks every bar shows its cheapest, and the bars with any of them count", async ({
  page,
}, info) => {
  await page.goto("/");
  await goToMilano(page);
  await expect(page.getByTestId("map-status")).toHaveText(/^2 bar su/); // beer: Duomo and Camparino
  await chooseDrinks(page, "Birra media", "Spritz");
  await expect(page.getByTestId("drink-summary")).toHaveText("Birra media, Spritz");
  await expect(drinkMenuButton(page)).toBeVisible();
  // The union: Duomo, Camparino, Terrazza Aperol.
  await expect(page.getByTestId("map-status")).toHaveText(/^3 bar su/);
  await expect(mapRegion(page)).toHaveAttribute("data-prices-shown", /6,00 €/, { timeout: 20_000 });
  await expect(mapRegion(page)).not.toHaveAttribute("data-prices-shown", /7,50 €/);

  await page.getByRole("button", { name: "Elenco" }).click();
  const list = page.getByRole("dialog", { name: "Bar nella zona" });
  const duomo = list.getByRole("link", { name: /Bistrot Duomo/ });
  await expect(duomo).toContainText("6,00 €"); // the beer, not the 7,50 € spritz
  await expect(duomo).toContainText("Birra media");
  const camparino = list.getByRole("link", { name: /Camparino/ });
  await expect(camparino).toContainText("9,00 €"); // the beer, not the 12,00 € spritz
  await expect(list.getByRole("link", { name: /Terrazza Aperol/ })).toContainText("10,00 € HH");
  await page.screenshot({ path: info.outputPath("mc-02-due-drink.png") });
  await list.getByRole("button", { name: "Chiudi" }).click();

  // The choice stays for the visit: back to one drink, the pins follow.
  await chooseDrinks(page, "Spritz");
  await expect(page.getByTestId("drink-summary")).toHaveText("Spritz");
  await expect(page.getByTestId("map-status")).toHaveText(/^3 bar su/);
});

test("MC-02 the cheapest of the chosen drinks is also what the cheapest-here list shows", async ({
  page,
}) => {
  await page.goto("/");
  await goToMilano(page);
  await chooseDrinks(page, "Birra media", "Spritz");
  await page.getByRole("button", { name: "Cerca" }).click();
  const cheapest = page.getByRole("list", { name: "I più economici qui" });
  const first = cheapest.getByRole("listitem").first();
  await expect(first).toContainText("Bistrot Duomo");
  await expect(first).toContainText("6,00 €");
  await expect(first).toContainText("Birra media");
});

test("MC-01 the open menu in Fuori orario, with two drinks chosen", async ({ page }, info) => {
  await atHour(page, THEME_HOURS.dark);
  await page.goto("/");
  await goToMilano(page);
  await chooseDrinks(page, "Birra media", "Spritz");
  await openDrinkMenu(page);
  if (info.project.name === "chromium")
    await page.screenshot({ path: "docs/screenshots/mc/menu-scuro-due-drink-390.png" });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("MC-01 tabbing out of the last drink closes the list", async ({ page }) => {
  await page.goto("/");
  await openDrinkMenu(page);
  await drinkList(page).getByRole("checkbox", { name: "Acqua" }).focus();
  await page.keyboard.press("Tab");
  await expect(drinkList(page)).toBeHidden();
});
