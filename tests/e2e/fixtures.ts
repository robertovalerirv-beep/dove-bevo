import { test as base } from "@playwright/test";

/**
 * `test` with the basemap tiles stubbed: the vector tiles of OpenFreeMap are drawn by software WebGL
 * on a CI runner, which starved animations and made every run time out on a different test. The
 * pins, clusters and prices are our own layers and need no tile. Specs that check the real map
 * (CSP with tiles, glyphs and sprites) set `test.use({ realTiles: true })`.
 */
export const test = base.extend<{ realTiles: boolean }>({
  realTiles: [false, { option: true }],
  page: async ({ page, realTiles }, use) => {
    if (!realTiles) {
      await page.route("https://tiles.openfreemap.org/planet", (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            tilejson: "3.0.0",
            tiles: ["https://tiles.openfreemap.org/planet/stub/{z}/{x}/{y}.pbf"],
            minzoom: 0,
            maxzoom: 14,
          }),
        }),
      );
      await page.route(/^https:\/\/tiles\.openfreemap\.org\/planet\/.+\.pbf/, (route) =>
        route.fulfill({ status: 200, contentType: "application/x-protobuf", body: "" }),
      );
    }
    await use(page);
  },
});
