import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
import { goToMilano, mapRegion, waitForBars, zoomOf } from "./helpers";

// M1-16: the map never changes size and never moves on its own. A bottom bar whose height followed the
// view (the "zona senza prezzi" invitation added a paragraph and two buttons) resized the map, the
// resize moved the view, the view reloaded the cells and could flip the bar back: the map kept jumping.

const chip = (page: Page, name: string) =>
  page.getByRole("group", { name: "Drink" }).getByRole("button", { name });

const heights = (page: Page) =>
  page.evaluate(() => ({
    map: document.querySelector(".map")?.getBoundingClientRect().height ?? 0,
    bar: document.querySelector(".bottom")?.getBoundingClientRect().height ?? 0,
  }));

/** Starts counting the resizes of the map and the changes of its reported centre and zoom. */
function startWatching(page: Page) {
  return page.evaluate(() => {
    const map = document.querySelector(".map") ?? document.body;
    const state = { resizes: -1, moves: 0 }; // the first observer callback is the initial size
    (window as unknown as { watched: typeof state }).watched = state;
    new ResizeObserver(() => {
      state.resizes++;
    }).observe(map);
    new MutationObserver((list) => {
      state.moves += list.length;
    }).observe(map, { attributes: true, attributeFilter: ["data-zoom", "data-center"] });
  });
}

const counts = (page: Page) =>
  page.evaluate(() => {
    const { resizes, moves } = (
      window as unknown as { watched: { resizes: number; moves: number } }
    ).watched;
    return { resizes, moves };
  });

test("M1-16 the map has the same height in a zone with prices and in one without", async ({
  page,
}) => {
  await page.goto("/");
  await goToMilano(page);
  const sizes: Record<string, { map: number; bar: number }> = {};
  // Birra and Negroni have almost no prices around the Duomo (the invitation), Spritz has enough.
  for (const [name, status] of [
    ["Birra alla spina 0,4 l", /^2 bar su/],
    ["Spritz", /^3 bar su/],
    ["Negroni", /^0 bar su/],
  ] as const) {
    await chip(page, name).click();
    await expect(page.getByTestId("map-status")).toHaveText(status);
    sizes[name] = await heights(page);
  }
  expect(sizes["Spritz"]).toEqual(sizes["Birra alla spina 0,4 l"]);
  expect(sizes["Negroni"]).toEqual(sizes["Birra alla spina 0,4 l"]);
});

for (const drink of ["Spritz", "Negroni"]) {
  test(`M1-16 ${drink}: the map neither resizes nor moves by itself, at every zoom from 13`, async ({
    page,
  }) => {
    await page.goto("/");
    await goToMilano(page);
    await chip(page, drink).click();
    await waitForBars(page);
    await mapRegion(page).locator("canvas").focus();
    let previous = await zoomOf(page);
    let checked = 0;
    // One step at a time: the reported zoom changes only when the animation has ended (moveend).
    for (const key of ["=", "=", "=", "-", "-", "-", "-"]) {
      await startWatching(page);
      await page.keyboard.press(key);
      await expect.poll(() => zoomOf(page)).not.toBe(previous);
      previous = await zoomOf(page);
      if (previous < 13) break;
      await waitForBars(page);
      // The gesture itself moves the map; the bar must not resize it at any moment.
      expect((await counts(page)).resizes, `resizes going to zoom ${String(previous)}`).toBe(0);
      // Then it stays where it is.
      const before = (await counts(page)).moves;
      await page.waitForTimeout(2_000); // only asserts an absence: a slow runner cannot fail it
      expect(await counts(page), `zoom ${String(previous)}`).toEqual({
        resizes: 0,
        moves: before,
      });
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });
}
