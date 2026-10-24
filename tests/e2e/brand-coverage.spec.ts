import { expect, type Locator } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "./fixtures";
import { chooseDrinks, goToMilano, mapRegion, mapStatus } from "./helpers";

// MB-08: "X bar su N qui hanno un prezzo" equals the count by hand on the fixture, and choosing a drink
// never asks the network for anything. Read-only.
// By hand, from tests/fixtures/seed.sql: the bars that have a price of the drink (a happy hour price
// counts, a price in quarantine or in review does not), among those inside the map as it is drawn.
const PRICED: Record<string, string[]> = {
  "Birra media": ["n2420779240", "n13001337602"],
  Spritz: ["n2420779240", "n13001337602", "n5471678323"], // the last has only a happy hour price
  "Calice di vino": ["n10081337586", "n11755824793", "n12258055483", "n4610306152", "n9888148629"],
  "Gin tonic": [], // its only price is in quarantine
};

type Bar = { key: string; lat: number; lon: number };
const fixtureBars = (): Bar[] =>
  readdirSync("tests/fixtures/data/v").flatMap((file) => {
    const cell = JSON.parse(readFileSync(`tests/fixtures/data/v/${file}`, "utf8")) as {
      v: [string, string, number, number, number][];
    };
    return cell.v.map((r) => ({ key: r[0], lat: r[3], lon: r[4] }));
  });

/** Web Mercator, 512 px tiles as MapLibre draws them: the bars inside a screen of w×h px. */
function barsOnScreen(centre: [number, number], zoom: number, w: number, h: number): Bar[] {
  const world = 512 * 2 ** zoom;
  const x = (lon: number) => ((lon + 180) / 360) * world;
  const y = (lat: number) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world;
  };
  const [cx, cy] = [x(centre[1]), y(centre[0])];
  return fixtureBars().filter(
    (b) => Math.abs(x(b.lon) - cx) <= w / 2 && Math.abs(y(b.lat) - cy) <= h / 2,
  );
}

/** The centre and zoom of the map once they have not moved for three reads in a row (it flies, then rests). */
async function restingView(region: Locator): Promise<{ centre: string; zoom: string }> {
  let last = "";
  let same = 0;
  for (let i = 0; i < 80 && same < 3; i++) {
    const now = `${(await region.getAttribute("data-center")) ?? ""}|${(await region.getAttribute("data-zoom")) ?? ""}`;
    same = now === last ? same + 1 : 0;
    last = now;
    await region.page().waitForTimeout(250);
  }
  const [centre = "", zoom = ""] = last.split("|");
  return { centre, zoom };
}

test("MB-08 the coverage is the count by hand, drink by drink", async ({ page }) => {
  await page.goto("/");
  await goToMilano(page);
  const region = mapRegion(page);
  const view = await restingView(region);
  const [lat = 0, lon = 0] = view.centre.split(",").map(Number);
  const zoom = Number(view.zoom);
  const box = (await region.boundingBox()) ?? { width: 0, height: 0 };
  const onScreen = barsOnScreen([lat, lon], zoom, box.width, box.height);
  const keys = new Set(onScreen.map((b) => b.key));
  const count = (...drinks: string[]) =>
    new Set(drinks.flatMap((d) => PRICED[d] ?? []).filter((k) => keys.has(k))).size;

  const cases: [("Birra media" | "Spritz" | "Calice di vino" | "Gin tonic")[], number][] = [
    [["Birra media"], count("Birra media")],
    [["Spritz"], count("Spritz")],
    [["Calice di vino"], count("Calice di vino")],
    [["Gin tonic"], 0],
  ];
  for (const [drinks, expected] of cases) {
    await chooseDrinks(page, ...drinks);
    await expect(mapStatus(page)).toHaveText(
      `${String(expected)} bar su ${String(onScreen.length)} qui hanno un prezzo`,
    );
  }
  // Two drinks: a bar with both is counted once.
  await chooseDrinks(page, "Spritz", "Birra media");
  await expect(mapStatus(page)).toHaveText(
    `${String(count("Spritz", "Birra media"))} bar su ${String(onScreen.length)} qui hanno un prezzo`,
  );
  expect(onScreen.length).toBeGreaterThan(5);
  expect(count("Calice di vino")).toBeGreaterThan(0);
});

test("MB-08 choosing drinks and moving the map ask the network for nothing", async ({ page }) => {
  await page.goto("/");
  await goToMilano(page);
  const calls: string[] = [];
  page.on("request", (r) => {
    const { pathname } = new URL(r.url());
    if (/^\/(api|data)\//.test(pathname)) calls.push(pathname);
  });
  await chooseDrinks(page, "Spritz");
  await chooseDrinks(page, "Calice di vino");
  await page.mouse.move(200, 400);
  await page.mouse.down();
  await page.mouse.move(215, 410, { steps: 4 }); // a short drag inside the loaded cells
  await page.mouse.up();
  await expect(mapStatus(page)).toContainText("bar su");
  expect(calls).toEqual([]);
});
