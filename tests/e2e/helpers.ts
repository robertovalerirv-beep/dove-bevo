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
  await page.getByRole("button", { name: "Cerca" }).click();
  await milanoFromOpenSearch(page);
}

/** The city search is already open (e.g. after a failed "Vicino a me"). */
export async function milanoFromOpenSearch(page: Page) {
  await page.getByRole("combobox", { name: "Cerca una città o un bar" }).fill("milano");
  await page
    .getByRole("listbox", { name: "Risultati" })
    .getByRole("option", { name: /^Milano/ })
    .first()
    .click();
  await waitForBars(page);
}
