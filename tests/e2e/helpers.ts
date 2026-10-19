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
