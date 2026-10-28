import { expect, type Page } from "@playwright/test";

export const DUOMO = { latitude: 45.46437, longitude: 9.18951 };

/** The map region exposes its zoom (DOM only, never sent) and a polite status line. */
export const mapRegion = (page: Page) => page.getByRole("region", { name: "Mappa", exact: true });
export const mapStatus = (page: Page) => page.getByTestId("map-status");

export async function zoomOf(page: Page): Promise<number> {
  return Number(await mapRegion(page).getAttribute("data-zoom"));
}

export async function waitForBars(page: Page) {
  await expect(mapStatus(page)).toHaveText(/\d+ bar su [1-9]\d* qui hanno un prezzo/, {
    timeout: 30_000,
  });
}

/** Opens the city search and moves the map to Milano. */
export async function goToMilano(page: Page) {
  await page.getByRole("button", { name: "Cerca città o bar" }).click();
  await milanoFromOpenSearch(page);
}

/** The city search is already open (e.g. after a failed "Vicino a me"). */
export async function milanoFromOpenSearch(page: Page) {
  await page.getByRole("combobox", { name: "Cerca una città o un bar" }).fill("milano");
  // The list is redrawn while the places and the bar fragment arrive: under load a click can land
  // on a row that was just replaced and do nothing. The choice has worked once the search is closed.
  await expect(async () => {
    const search = page.getByRole("dialog", { name: "Cerca" });
    if (await search.count()) {
      await page
        .getByRole("listbox", { name: "Risultati" })
        .getByRole("option", { name: /^Milano/ })
        .first()
        .click({ timeout: 5_000 });
    }
    await expect(search).toHaveCount(0, { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await waitForBars(page);
}

/**
 * Fixes the hour of the page clock (the theme follows it: Bancone by day, Fuori orario from 21:30,
 * ADR 0025). The day stays today's, so nothing that depends on the date changes; timers keep running.
 */
export async function atHour(page: Page, hour: number, minute = 0) {
  const when = new Date();
  when.setHours(hour, minute, 0, 0);
  await page.clock.setFixedTime(when);
}

export const THEME_HOURS = { light: 12, dark: 22 } as const;

/** The nine drinks of «Scegli cosa bere», in the order of the list. */
export const DRINK_NAMES = [
  "Birra media",
  "Spritz",
  "Negroni",
  "Sbagliato",
  "Gin tonic",
  "Gin lemon",
  "Calice di vino",
  "Analcolico",
  "Acqua",
] as const;

export const drinkMenuButton = (page: Page) =>
  page.getByRole("button", { name: /^Scegli cosa bere/ });
export const drinkList = (page: Page) => page.getByRole("group", { name: "Drink" });

/** Opens the list of drinks if it is closed. */
export async function openDrinkMenu(page: Page) {
  const button = drinkMenuButton(page);
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  await expect(drinkList(page)).toBeVisible();
}

/** Chooses exactly these drinks on the map (the first one is kept checked while the others change) and closes the list. */
export async function chooseDrinks(page: Page, ...names: (typeof DRINK_NAMES)[number][]) {
  await openDrinkMenu(page);
  const list = drinkList(page);
  const toggle = async (name: string, wanted: boolean) => {
    const box = list.getByRole("checkbox", { name });
    if ((await box.isChecked()) !== wanted) await list.locator("label", { hasText: name }).click();
    if (wanted) await expect(box).toBeChecked();
    else await expect(box).not.toBeChecked();
  };
  for (const name of names) await toggle(name, true); // the wanted first: the last check cannot go
  for (const name of DRINK_NAMES) if (!names.includes(name)) await toggle(name, false);
  await drinkMenuButton(page).click();
  await expect(list).toBeHidden();
}

/**
 * A tap on the picture of the map that starts it, away from the button in the centre (D-37): a tap
 * in the middle lands on that button, which starts the map too (map-start.spec.ts).
 */
export async function tapMap(page: Page) {
  await page
    .getByRole("button", { name: "Esplora la mappa" })
    .click({ position: { x: 40, y: 160 } });
}
