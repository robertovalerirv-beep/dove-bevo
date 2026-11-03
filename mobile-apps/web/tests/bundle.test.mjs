import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import path from "node:path";
import { before, after, test } from "node:test";
import { chromium } from "@playwright/test";
import { contrastRatio } from "./contrast.mjs";
import { pageCsp } from "../../../src/worker/lib/security-headers.ts";
/* global document, getComputedStyle, history, location */

const root = fileURLToPath(new URL("../../..", import.meta.url));
const client = path.join(root, "dist/client");
const output = fileURLToPath(new URL("../test-results", import.meta.url));
let browser;
before(async () => {
  assert.ok(
    existsSync(path.join(client, "mobile/index.html")),
    "Build the complete production bundle first",
  );
  mkdirSync(output, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.DOVEBEVO_BROWSER ? { executablePath: process.env.DOVEBEVO_BROWSER } : {}),
    args: ["--enable-unsafe-swiftshader"],
  });
});
after(async () => {
  await browser?.close();
});

const rows = [
  ["n123", "spritz", 0, 550, "2026-11-01", 4, 0],
  ["n123", "beer_draft", 0, 500, "2026-11-01", 0, 0],
  ["n456", "spritz", 1, 600, "2026-11-01", 0, 0],
];
async function fixture(viewport = { width: 390, height: 844 }, options = {}) {
  const context = await browser.newContext({
    viewport,
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage(),
    writes = [],
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (request.method() !== "GET") {
      writes.push(url.pathname);
      return route.abort();
    }
    if (url.origin !== "https://mobile.fixture.test") {
      if (
        process.env.DOVEBEVO_LIVE_MAP_STYLE === "1" &&
        url.origin === "https://tiles.openfreemap.org"
      )
        return route.continue();
      // A minimal local map style is used for deterministic hit tests. No external requests run.
      if (url.href === "https://tiles.openfreemap.org/planet")
        return route.fulfill({ json: { tiles: [] } });
      return route.abort();
    }
    if (url.pathname === "/mobile/" || url.pathname === "/mobile/index.html") {
      const html = readFileSync(path.join(client, "mobile/index.html"), "utf8").replaceAll(
        "<script ",
        '<script nonce="fixture-nonce" ',
      );
      return route.fulfill({
        contentType: "text/html",
        headers: { "Content-Security-Policy": pageCsp("fixture-nonce") },
        body: html,
      });
    }
    if (
      process.env.DOVEBEVO_LIVE_MAP_STYLE !== "1" &&
      /^\/assets\/mobile\/mobile-map-.*\.json$/.test(url.pathname)
    ) {
      options.mapStyleRequests?.push(url.pathname);
      if (options.mapUnavailable) return route.fulfill({ status: 503, body: "Map unavailable" });
      return route.fulfill({
        json: {
          version: 8,
          sources: {},
          glyphs: "https://mobile.fixture.test/empty/{fontstack}/{range}.pbf",
          layers: [
            { id: "background", type: "background", paint: { "background-color": "#f5f6f3" } },
          ],
        },
      });
    }
    if (/^\/map-italia-(?:light|dark)\.webp$/.test(url.pathname))
      return route.fulfill({
        contentType: "image/webp",
        body: readFileSync(path.join(client, url.pathname.slice(1))),
      });
    if (/^\/data\/fixture\/v\/[0-9a-z]{5}\.json$/.test(url.pathname))
      return route.fulfill({
        json: url.pathname.endsWith("u0nd9.json")
          ? {
              c: [[62505581, "Milano"]],
              v: [
                ["n123", "Locale di prova", 1, 45.4642, 9.19, "Via di prova 1", 0],
                [
                  "n456",
                  "Altro locale di prova",
                  1,
                  options.priceHeadOverlap ? 45.46495 : options.densePrices ? 45.4645 : 45.4652,
                  options.priceHeadOverlap ? 9.19 : options.densePrices ? 9.1906 : 9.195,
                  "Via di prova 2",
                  0,
                ],
                ["n789", "Unpriced overlap fixture", 0, 45.4647, 9.19, "Via di prova 3", 0],
              ],
            }
          : { c: [], v: [] },
      });
    if (options.menu && /^\/api\/mobile\/v2\/menu\/cells\//.test(url.pathname)) {
      const cell = url.pathname.split("/").at(-1);
      const categories = (url.searchParams.get("categories") ?? "").split(",").filter(Boolean);
      options.cellRequests?.push({ cell, categories: [...categories] });
      if (options.holdFirstIdentity && cell === "u0nd9" && categories.length === 0) {
        options.holdFirstIdentity = false;
        await new Promise((resolve) => {
          options.releaseOldIdentity = resolve;
        });
        return route.fulfill({ status: 503, body: "Old identity request failed" });
      }
      if (options.menuUnavailable) return route.fulfill({ status: 503, body: "Unavailable" });
      const source = {
        id: "source-1",
        url: "https://official.fixture.test/menu",
        text_sha256: "a".repeat(64),
        checked_on: "2026-11-02",
      };
      const offer = {
        id: "offer-1",
        name: options.uncategorized ? "Signature senza categoria" : "Spritz speciale",
        category: options.uncategorized ? null : "spritz",
        serving: { label: "Calice", ml: null },
        amount_minor: 750,
        currency: "EUR",
        currency_exponent: 2,
        context: { kind: "regular", condition: null },
        source,
      };
      const venue = {
        key: "maaaaaaaaaaaaaaaaaaaaaaaa",
        cell: "u0nd9",
        name: "Locale da menu",
        kind: 0,
        lat: 45.4695,
        lon: 9.188,
        address: "Via nuova 1",
        city: "Milano",
        country: "IT",
        identity_url: "https://official.fixture.test/",
        identity_kind: "owner_verified",
        matching_offer_count: 1,
        sample_offers: !options.uncategorized && categories.includes("spritz") ? [offer] : [],
        fee_coverage: { status: "unknown", source: null },
      };
      return route.fulfill({
        json: {
          schema_version: 2,
          coverage: { complete: false, basis: "verified_source_items_only" },
          price_scope: "menu_item_only",
          cell,
          category: null,
          categories: categories.length ? categories : null,
          venues:
            cell === "u0nd9" &&
            (!categories.length || (!options.uncategorized && categories.includes("spritz")))
              ? [venue]
              : [],
          next_after: null,
          unresolved_venues: 0,
        },
      });
    }
    if (
      options.menu &&
      (url.pathname === "/api/mobile/v2/menu/venues/maaaaaaaaaaaaaaaaaaaaaaaa" ||
        (options.staticMenu && url.pathname === "/api/mobile/v2/menu/venues/n123"))
    ) {
      if (options.detailUnavailable) return route.fulfill({ status: 503, body: "Unavailable" });
      const staticVenue = url.pathname.endsWith("/n123");
      const source = {
        id: "source-1",
        url: "https://official.fixture.test/menu",
        text_sha256: "a".repeat(64),
        checked_on: "2026-11-02",
      };
      return route.fulfill({
        json: {
          schema_version: 2,
          coverage: { complete: false, basis: "verified_source_items_only" },
          price_scope: "menu_item_only",
          venue: {
            key: staticVenue ? "n123" : "maaaaaaaaaaaaaaaaaaaaaaaa",
            cell: "u0nd9",
            name: staticVenue ? "Locale di prova" : "Locale da menu",
            kind: 0,
            lat: 45.4695,
            lon: 9.188,
            address: "Via nuova 1",
            city: "Milano",
            country: "IT",
          },
          stored_offer_count: 1,
          offers: [
            {
              id: "offer-1",
              name: options.uncategorized ? "Signature senza categoria" : "Spritz speciale",
              category: options.uncategorized ? null : "spritz",
              serving: { label: "Calice", ml: null },
              amount_minor: 750,
              currency: "EUR",
              currency_exponent: 2,
              context: { kind: "regular", condition: null },
              source,
            },
          ],
          next_after: null,
          fees: [],
          fee_coverage: { status: "unknown", source: null },
        },
      });
    }
    if (/^\/api\/mobile\/v2\/menu\//.test(url.pathname))
      return route.fulfill({ status: 404, body: "Not found" });
    if (
      options.customerEmpty &&
      /^\/api\/mobile\/v2\/customer-prices\/venues\//.test(url.pathname)
    ) {
      const key = url.pathname.split("/").at(-1);
      return route.fulfill({
        json: {
          schema_version: 1,
          venue: {
            key,
            cell: "u0nd9",
            name: key === "n123" ? "Locale di prova" : "Locale da menu",
            country: "IT",
          },
          price_scope: "customer_reported_drink_item",
          rows: [],
          next_after: null,
        },
      });
    }
    if (/^\/api\/prices\//.test(url.pathname))
      return route.fulfill({
        json: {
          p: url.pathname.endsWith("u0nd9")
            ? options.densePrices
              ? [...rows, ["n456", "spritz", 0, 600, "2026-11-01", 0, 0]]
              : rows
            : [],
          u: [],
          pend: [],
          h: [],
          g: [],
        },
      });
    if (/^\/api\/venues\/n123\/prices$/.test(url.pathname))
      return route.fulfill({ json: { p: rows.filter((r) => r[0] === "n123"), h: [] } });
    if (/^\/assets\/mobile\/|^\/fonts\/|^\/brand\//.test(url.pathname)) {
      const file = path.resolve(client, url.pathname.slice(1));
      assert.ok(file.startsWith(client + path.sep));
      if (!existsSync(file)) return route.abort();
      const contentType = file.endsWith(".css")
        ? "text/css"
        : /\.(mjs|js)$/.test(file)
          ? "text/javascript"
          : file.endsWith(".jpg")
            ? "image/jpeg"
            : file.endsWith(".json")
              ? "application/json"
              : file.endsWith(".woff2")
                ? "font/woff2"
                : "image/svg+xml";
      return route.fulfill({ contentType, body: readFileSync(file) });
    }
    return route.abort();
  });
  return { context, page, writes, errors, close: () => context.close() };
}

async function openDrinks(page) {
  const toggle = page.locator(".mobile-drink-menu__button");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  return page.locator(".mobile-drink-strip");
}

async function selectOnlyDrink(page, name) {
  const drinks = await openDrinks(page);
  await drinks.getByRole("checkbox", { name, exact: true }).check({ force: true });
  await drinks.getByRole("checkbox", { name: "Birra media", exact: true }).uncheck({
    force: true,
  });
  await page.locator(".mobile-drink-menu__button").click();
}

test("production mobile entry renders chips and preserves venue route across reload and close", async () => {
  const f = await fixture();
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/?path=%2Fbar%2Fn123&c=u0nd9");
    const name = f.page.locator("h2.scontrino__name");
    await name.waitFor();
    assert.equal(await name.textContent(), "Locale di prova");
    assert.match(
      await f.page.locator(".mobile-price--featured").innerText(),
      /Birra media[\s\S]*5,00/,
    );
    const photo = f.page.locator(".mobile-price--featured img");
    assert.equal(await photo.evaluate((img) => img.complete && img.naturalWidth > 0), true);
    await f.page.reload();
    await name.waitFor();
    assert.equal(await name.textContent(), "Locale di prova");
    await f.page.screenshot({ path: path.join(output, "venue-fixture.png") });
    await f.page
      .locator(".mobile-price--featured")
      .getByRole("button", { name: "È cambiato", exact: true })
      .click();
    await f.page.locator(".mobile-price-form").waitFor();
    assert.equal(
      await f.page.locator(".mobile-price-flow__venue").textContent(),
      "Locale di prova",
    );
    await f.page.screenshot({ path: path.join(output, "price-form-fixture.png") });
    await f.page
      .getByRole("dialog")
      .last()
      .getByRole("button", { name: "Chiudi", exact: true })
      .click();
    await name.waitFor();
    await f.page.getByRole("dialog").getByRole("button", { name: "Chiudi", exact: true }).click();
    await f.page.waitForFunction(() => document.querySelectorAll("dialog[open]").length === 0);
    assert.equal(new URL(f.page.url()).pathname, "/mobile/");
    assert.equal(new URL(f.page.url()).searchParams.has("path"), false);
    const chips = await openDrinks(f.page);
    assert.equal(await chips.getByRole("checkbox").count(), 9);
    assert.equal(
      await chips.getByRole("checkbox", { name: "Birra media", exact: true }).isChecked(),
      true,
    );
    assert.equal(
      await chips
        .getByRole("button", { name: "Tutti", exact: true })
        .evaluate((el) => el === el.parentElement?.lastElementChild),
      true,
    );
    assert.equal(
      await chips.getByRole("button", { name: "Tutti", exact: true }).getAttribute("aria-pressed"),
      "false",
    );
    assert.equal(
      await chips.getByRole("checkbox", { name: "Spritz", exact: true }).isChecked(),
      false,
    );
    await chips.getByText("Spritz", { exact: true }).click();
    assert.equal(
      await chips.getByRole("checkbox", { name: "Spritz", exact: true }).isChecked(),
      true,
    );
    assert.equal(
      await chips
        .getByRole("checkbox", { name: "Spritz", exact: true })
        .getAttribute("aria-disabled"),
      null,
    );
    const selected = await chips
      .locator("label:has(input:checked)")
      .first()
      .evaluate((el) => ({
        bg: getComputedStyle(el).backgroundColor,
        text: getComputedStyle(el).color,
      }));
    assert.deepEqual(selected, { bg: "rgb(255, 90, 31)", text: "rgb(27, 22, 17)" });
    await chips.getByRole("checkbox", { name: "Spritz", exact: true }).focus();
    await f.page.keyboard.press("Space");
    assert.equal(
      await chips.getByRole("checkbox", { name: "Spritz", exact: true }).isChecked(),
      false,
    );
    await chips.getByText("Spritz", { exact: true }).click();
    assert.equal(
      await chips.getByRole("checkbox", { name: "Spritz", exact: true }).isChecked(),
      true,
    );
    await chips.getByText("Spritz", { exact: true }).click();
    assert.equal(
      await chips.getByRole("checkbox", { name: "Spritz", exact: true }).isChecked(),
      false,
    );
    assert.equal(
      await chips.getByRole("checkbox", { name: "Birra media", exact: true }).isChecked(),
      true,
    );
    assert.deepEqual(f.errors, []);
    assert.equal(
      f.writes.some((p) => p.startsWith("/api/prices") || p.includes("recommend")),
      false,
    );
  } finally {
    await f.close();
  }
});

test("drink checkboxes stay inside the narrow scrolling strip and viewport", async () => {
  const f = await fixture({ width: 412, height: 540 });
  f.page.setDefaultTimeout(5000);
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/?at=45.4642,9.19");
    await openDrinks(f.page);
    await f.page.locator(".mobile-drink-strip input").last().waitFor({ state: "attached" });
    const geometry = await f.page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      inputs: [...document.querySelectorAll(".drink-option input")].map((input) => ({
        parent: input.offsetParent?.className,
        right: input.getBoundingClientRect().right,
      })),
    }));
    assert.equal(geometry.width, 412);
    assert.ok(geometry.scrollWidth <= 412, JSON.stringify(geometry));
    assert.ok(geometry.inputs.every((input) => input.parent === "drink-option"));
    const strip = f.page.locator(".mobile-drink-strip");
    await strip.getByRole("checkbox", { name: "Acqua", exact: true }).focus();
    await f.page.keyboard.press("Space");
    assert.equal(
      await strip.getByRole("checkbox", { name: "Acqua", exact: true }).isChecked(),
      true,
    );
    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth), 412);
    const locate = await f.page.locator(".top__row > .icon-btn").boundingBox();
    assert.ok(locate && locate.x >= 0 && locate.x + locate.width <= 412);
    const nativeSearch = f.page.locator('button[data-dovebevo-search="1"]');
    assert.equal(
      await nativeSearch.count(),
      1,
      "The native Cerca command has one app-owned map target",
    );
    await nativeSearch.click();
    const dialog = f.page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByRole("combobox").fill("Milano");
    for (const height of [320, 540]) {
      await f.page.setViewportSize({ width: 412, height });
      const box = await dialog.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= 412);
      assert.ok(box.y >= 0 && box.y + box.height <= height + 1);
      assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth), 412);
    }
    await f.page.keyboard.press("Escape");
    assert.equal(await dialog.getByRole("combobox").inputValue(), "");
    await f.page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    const canvas = f.page.locator(".maplibregl-canvas");
    await canvas.waitFor();
    const mapBox = await canvas.boundingBox();
    assert.ok(mapBox && mapBox.x >= 0 && mapBox.x + mapBox.width <= 412);
    assert.ok(mapBox.y < 540 && mapBox.y + mapBox.height > 0);
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("visible price-pin head and geographic tip both open the correct venue", async () => {
  const f = await fixture();
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/?at=45.4642,9.19");
    await selectOnlyDrink(f.page, "Spritz");
    await f.page.waitForFunction(
      () =>
        document.querySelector("section.map")?.getAttribute("data-prices-shown")?.includes("5,50"),
      { timeout: 30000 },
    );
    const map = f.page.locator("section.map"),
      box = await map.boundingBox();
    assert.ok(box);
    const initialHistory = await f.page.evaluate(() => history.length);
    await f.page.screenshot({ path: path.join(output, "map-hit-fixture.png") });
    for (const offset of [-33, 0]) {
      await f.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + offset);
      await f.page.locator("h2.scontrino__name").waitFor();
      assert.equal(await f.page.locator("h2.scontrino__name").textContent(), "Locale di prova");
      assert.equal(new URL(f.page.url()).searchParams.get("path"), "/bar/n123");
      assert.equal(
        await f.page.evaluate(() => history.length),
        initialHistory + 1,
        "One overlapping pin tap must create exactly one entry",
      );
      await f.page.getByRole("dialog").getByRole("button", { name: "Chiudi", exact: true }).click();
      await f.page.waitForFunction(() => document.querySelectorAll("dialog[open]").length === 0);
    }
    await f.page.goForward();
    await f.page.locator("h2.scontrino__name").waitFor();
    assert.equal(await f.page.locator("h2.scontrino__name").textContent(), "Locale di prova");
    await f.page.goBack();
    await f.page.waitForFunction(() => document.querySelectorAll("dialog[open]").length === 0);
    for (const width of [320, 390]) {
      await f.page.setViewportSize({ width, height: 844 });
      const locate = await f.page.locator(".top__row > .icon-btn").boundingBox();
      const status = await f.page.locator(".map__status").boundingBox();
      assert.ok(locate && status);
      assert.ok(
        locate.y + locate.height <= status.y ||
          locate.y >= status.y + status.height ||
          locate.x + locate.width <= status.x ||
          locate.x >= status.x + status.width,
        `Locate must not cover coverage text at ${width}px`,
      );
    }
    assert.deepEqual(f.errors, []);
    assert.equal(
      f.writes.some((p) => p.startsWith("/api/prices")),
      false,
    );
  } finally {
    await f.close();
  }
});

test("zoom hint fits between the map language and venue-list controls", async () => {
  const f = await fixture();
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/");
    const status = f.page.getByTestId("map-status");
    await status.getByText("Avvicinati o cerca città").waitFor();
    assert.equal(await status.getAttribute("data-mobile-zoom-hint"), "1");
    for (const width of [320, 390]) {
      await f.page.setViewportSize({ width, height: 700 });
      const hint = await status.boundingBox();
      const language = await f.page.locator(".map__lang").boundingBox();
      const list = await f.page.locator(".map__list").boundingBox();
      assert.ok(hint && language && list);
      assert.ok(language.x + language.width <= hint.x);
      assert.ok(hint.x + hint.width <= list.x);
      assert.ok(Math.abs(hint.y - language.y) <= 4);
      assert.ok(hint.height <= 48);
      if (width === 320)
        await f.page.screenshot({ path: path.join(output, "map-zoom-hint-320-fixture.png") });
    }
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("a dense priced dot opens its own venue and retains the exact viewed price after closing", async () => {
  const f = await fixture({ width: 393, height: 852 }, { densePrices: true });
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/?at=45.4642,9.19");
    const menu = await openDrinks(f.page);
    await menu.getByText("Spritz", { exact: true }).click();
    await menu.getByText("Birra media", { exact: true }).click();
    await f.page.locator(".mobile-drink-menu__button").click();
    await f.page.waitForFunction(
      () => document.querySelector("section.map")?.getAttribute("data-ready") === "true",
    );
    await f.page.waitForFunction(
      () =>
        (document.querySelector("section.map")?.getAttribute("data-prices-shown") ?? "").includes(
          "5,50",
        ) ||
        (document.querySelector("section.map")?.getAttribute("data-prices-shown") ?? "").includes(
          "6,00",
        ),
    );
    const point = await f.page.evaluate(() => {
      const map = document.querySelector("section.map"),
        rect = map.querySelector(".map__canvas").getBoundingClientRect();
      const [lat, lon] = map.dataset.center.split(",").map(Number),
        zoom = Number(map.dataset.zoom);
      const scale = 512 * 2 ** zoom;
      const mercatorY = (degrees) => {
        const radians = (degrees * Math.PI) / 180;
        return ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) * scale) / 2;
      };
      return {
        x: rect.left + rect.width / 2 + ((9.1906 - lon) * scale) / 360,
        y: rect.top + rect.height / 2 + mercatorY(45.4645) - mercatorY(lat),
      };
    });
    await f.page.mouse.move(point.x, point.y);
    await f.page.mouse.wheel(0, 650);
    await f.page.waitForFunction(
      () => Number(document.querySelector("section.map")?.getAttribute("data-zoom")) < 14,
    );
    await f.page.mouse.click(point.x, point.y);
    await f.page.getByRole("heading", { name: "Altro locale di prova" }).waitFor();
    assert.equal(new URL(f.page.url()).searchParams.get("path"), "/bar/n456");
    await f.page.getByRole("dialog").getByRole("button", { name: "Chiudi", exact: true }).click();
    await f.page.waitForFunction(() =>
      (document.querySelector(".maplibregl-map")?.dataset.selectedPrice ?? "").includes("6,00"),
    );
    await f.page.mouse.move(point.x, point.y);
    await f.page.mouse.wheel(0, -650);
    await f.page.waitForFunction(
      () => Number(document.querySelector("section.map")?.getAttribute("data-zoom")) >= 14,
    );
    assert.match(
      await f.page.locator(".maplibregl-map").getAttribute("data-selected-price"),
      /6,00/,
    );
    assert.equal(new URL(f.page.url()).searchParams.has("path"), false);
    const again = await openDrinks(f.page);
    await again.getByText("Birra media", { exact: true }).click();
    await again.getByText("Spritz", { exact: true }).click();
    await f.page.waitForFunction(
      () => document.querySelector(".maplibregl-map")?.dataset.selectedPrice === "",
    );
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("a visible price label opens its own venue even when another priced dot is underneath", async () => {
  const f = await fixture(
    { width: 393, height: 852 },
    { densePrices: true, priceHeadOverlap: true },
  );
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/?at=45.4642,9.19");
    await selectOnlyDrink(f.page, "Spritz");
    await f.page.waitForFunction(() =>
      document.querySelector("section.map")?.getAttribute("data-prices-shown")?.includes("5,50"),
    );
    const box = await f.page.locator("section.map").boundingBox();
    assert.ok(box);
    await f.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 25);
    await f.page.getByRole("heading", { name: "Locale di prova" }).waitFor();
    assert.equal(new URL(f.page.url()).searchParams.get("path"), "/bar/n123");
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("Italian city search in the production mobile entry links the approved app privacy policy", async () => {
  const f = await fixture();
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/");
    await f.page.locator(".search-field").click();
    const links = f.page
      .getByRole("dialog")
      .getByRole("navigation", { name: "Informazioni", exact: true });
    await links.waitFor();
    assert.equal(
      await links.getByRole("link", { name: "Privacy", exact: true }).getAttribute("href"),
      "https://github.com/robertovalerirv-beep/dove-bevo/blob/main/mobile-apps/privacy.md",
    );
    assert.equal(
      await links.getByRole("link", { name: "Regole", exact: true }).getAttribute("href"),
      "/regole",
    );
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("Cerca closes the selected Italian venue before search and Cancel leaves the loaded map", async () => {
  const f = await fixture();
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/?path=%2Fbar%2Fn123&c=u0nd9");
    await f.page.locator("h2.scontrino__name").waitFor();
    const historyLength = await f.page.evaluate(() => history.length);
    const map = f.page.locator("section.map");
    await f.page.waitForFunction(() =>
      Boolean(document.querySelector("section.map")?.getAttribute("data-center")),
    );
    const center = await map.getAttribute("data-center");
    const afterClick = await f.page.evaluate(() => {
      document.querySelector('button[data-dovebevo-search="1"]').click();
      return location.href;
    });
    assert.equal(new URL(afterClick).pathname, "/mobile/");
    assert.equal(new URL(afterClick).searchParams.has("path"), false);
    assert.equal(await f.page.evaluate(() => history.length), historyLength);
    const search = f.page.getByRole("dialog");
    await search.getByRole("combobox").waitFor();
    assert.equal(await map.getAttribute("data-selected"), "");
    await f.page.keyboard.press("Escape");
    await search.waitFor({ state: "hidden" });
    assert.equal(await map.getAttribute("data-center"), center);
    assert.equal(await map.count(), 1, "Cancel keeps the existing map instance");
    await f.page.locator(".map__list").click();
    await f.page
      .getByRole("dialog")
      .getByRole("link", { name: /^Locale di prova/ })
      .click();
    await f.page.locator("h2.scontrino__name").waitFor();
    assert.equal(new URL(f.page.url()).searchParams.get("path"), "/bar/n123");
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("orange mobile controls retain readable selected, unselected and focused drink chips", async () => {
  const f = await fixture();
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/");
    const strip = await openDrinks(f.page);
    await strip.waitFor();
    assert.equal(
      await f.page.getByRole("button", { name: "Tutti", exact: true }).getAttribute("aria-pressed"),
      "false",
    );
    await strip.getByRole("checkbox", { name: "Spritz", exact: true }).check({ force: true });
    for (const name of ["Spritz", "Birra media"]) {
      const option = strip
        .locator("label")
        .filter({ has: f.page.getByRole("checkbox", { name, exact: true }) });
      const input = option.getByRole("checkbox");
      await input.focus();
      const colors = await option.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          text: style.color,
          outline: style.outlineColor,
          outlineStyle: style.outlineStyle,
        };
      });
      if (name === "Spritz") assert.equal(colors.background, "rgb(255, 90, 31)");
      assert.ok(contrastRatio(colors.text, colors.background) >= 4.5, JSON.stringify(colors));
      assert.equal(colors.outlineStyle, "solid");
      assert.ok(contrastRatio(colors.outline, colors.background) >= 4.5, JSON.stringify(colors));
      assert.ok(contrastRatio(colors.outline, "rgb(255, 244, 228)") >= 4.5, JSON.stringify(colors));
    }
    const primary = await f.page.locator(".mobile-map-actions__toggle").evaluate((button) => ({
      background: getComputedStyle(button).backgroundColor,
      text: getComputedStyle(button).color,
    }));
    assert.equal(primary.background, "rgb(255, 90, 31)");
    assert.ok(contrastRatio(primary.text, primary.background) >= 4.5);
    await f.page.screenshot({ path: path.join(output, "orange-map-controls-fixture.png") });
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("approved owner menu venue appears as a menu price pin and opens read-only detail", async () => {
  const f = await fixture({ width: 390, height: 844 }, { menu: true });
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/?at=45.4642,9.19");
    await openDrinks(f.page);
    await f.page.getByRole("checkbox", { name: "Spritz", exact: true }).check({ force: true });
    await f.page.locator(".mobile-menu-map-note").waitFor();
    await f.page.waitForFunction(
      () =>
        document.querySelector("section.map")?.getAttribute("data-prices-shown")?.includes("7,50"),
      { timeout: 30000 },
    );
    assert.match(await f.page.locator(".mobile-menu-map-note").innerText(), /supplementi esclusi/);
    await f.page.goto(
      "https://mobile.fixture.test/mobile/?path=%2Fbar%2Fmaaaaaaaaaaaaaaaaaaaaaaaa&c=u0nd9",
    );
    await f.page.getByRole("heading", { name: "Locale da menu" }).waitFor();
    assert.match(await f.page.locator(".bar__kind").innerText(), /Locale · Milano/);
    assert.match(
      await f.page.getByRole("region", { name: "Prezzi dal menu online" }).innerText(),
      /Spritz speciale[\s\S]*7,50\s€[\s\S]*costi aggiuntivi non sono stati verificati/,
    );
    assert.equal(await f.page.getByRole("button", { name: "Aggiungi un prezzo qui" }).count(), 0);
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("empty menu-linked customer section does not deny an existing legacy price", async () => {
  const f = await fixture(
    { width: 430, height: 844 },
    { menu: true, staticMenu: true, customerEmpty: true },
  );
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/?path=%2Fbar%2Fn123&c=u0nd9");
    await f.page.getByRole("heading", { name: "Locale di prova" }).waitFor();
    await f.page.locator(".prices .price").first().waitFor();
    assert.match(
      await f.page.locator(".prices .price").first().innerText(),
      /Birra media[\s\S]*5,00/,
    );
    const customer = f.page.getByRole("region", { name: "Prezzi segnalati dai clienti" });
    await customer.getByText("Nessun altro prezzo segnalato per i drink del menu.").waitFor();
    await f.page.goto(
      "https://mobile.fixture.test/mobile/?path=%2Fbar%2Fmaaaaaaaaaaaaaaaaaaaaaaaa&c=u0nd9",
    );
    await f.page.getByRole("heading", { name: "Locale da menu" }).waitFor();
    await customer.getByText("Nessun prezzo segnalato per i drink del menu.").waitFor();
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("Tutti reveals uncategorized verified menus without inventing a drink price", async () => {
  const options = { menu: true, uncategorized: true, cellRequests: [] };
  const f = await fixture({ width: 390, height: 844 }, options);
  try {
    const coverageLines = () =>
      f.page.getByTestId("map-status").evaluate((element) => {
        const count = [...element.childNodes].find(
          (node) => node.nodeType === 3 && /\d+\/\d+ con prezzo/.test(node.textContent ?? ""),
        );
        if (!count) return 0;
        const range = document.createRange();
        range.selectNodeContents(count);
        return [...range.getClientRects()].filter((rect) => rect.width > 0).length;
      });
    await f.page.goto("https://mobile.fixture.test/mobile/?at=45.4642,9.19");
    const all = (await openDrinks(f.page)).getByRole("button", { name: "Tutti", exact: true });
    await all.click();
    assert.equal(await f.page.locator(".mobile-drink-all").getAttribute("aria-pressed"), "true");
    await f.page.waitForFunction(
      () =>
        document
          .querySelector("section.map")
          ?.getAttribute("data-prices-shown")
          ?.includes("1 VOCE"),
      { timeout: 30000 },
    );
    assert.match(await f.page.getByTestId("map-status").innerText(), /3\/4 con prezzo/);
    assert.match(
      await f.page.locator(".mobile-menu-map-note").innerText(),
      /voci di menu verificate/,
    );
    for (const width of [320, 390, 430]) {
      await f.page.setViewportSize({ width, height: 700 });
      const card = await f.page.getByTestId("map-status").boundingBox();
      const note = await f.page.locator(".mobile-menu-map-note").boundingBox();
      const add = await f.page.locator(".mobile-map-actions__toggle").boundingBox();
      const locate = await f.page.locator(".top__row > .icon-btn").boundingBox();
      const language = await f.page.locator(".map__lang").boundingBox();
      const list = await f.page.locator(".map__list").boundingBox();
      assert.ok(card && note && add && locate && language && list);
      assert.ok(note.y >= card.y && note.y + note.height <= card.y + card.height);
      assert.ok(
        card.y + card.height + 8 <= add.y,
        `Summary overlaps Add at ${width}px: ${JSON.stringify({ card, note, add, locate })}`,
      );
      assert.ok(
        locate.y + locate.height + 8 <= add.y,
        `Locate overlaps Add at ${width}px: ${JSON.stringify({ card, note, add, locate })}`,
      );
      assert.ok(language.y + language.height + 8 <= card.y);
      assert.ok(list.y + list.height + 8 <= card.y);
      assert.equal(await coverageLines(), 1, `Coverage wraps at ${width}px`);
    }
    await f.page.setViewportSize({ width: 393, height: 700 });
    await f.page.screenshot({ path: path.join(output, "app-map-summary-393-fixture.png") });
    await f.page.setViewportSize({ width: 430, height: 700 });
    await f.page.screenshot({ path: path.join(output, "app-map-summary-430-fixture.png") });
    await f.page.evaluate(() => {
      const style = document.createElement("style");
      style.nonce = "fixture-nonce";
      style.textContent = "html { font-size: 26px; }";
      document.head.append(style);
    });
    for (const width of [320, 390, 430]) {
      await f.page.setViewportSize({ width, height: 700 });
      const largeCard = await f.page.getByTestId("map-status").boundingBox();
      const largeNote = await f.page.locator(".mobile-menu-map-note").boundingBox();
      const largeAdd = await f.page.locator(".mobile-map-actions__toggle").boundingBox();
      assert.ok(largeCard && largeNote && largeAdd);
      assert.ok(
        largeNote.y >= largeCard.y &&
          largeNote.y + largeNote.height <= largeCard.y + largeCard.height,
      );
      assert.ok(
        largeCard.y + largeCard.height + 8 <= largeAdd.y,
        `Large text overlaps Add at ${width}px`,
      );
      assert.equal(await coverageLines(), 1, `Large-text coverage wraps at ${width}px`);
    }
    await f.page.setViewportSize({ width: 430, height: 700 });
    await f.page.screenshot({ path: path.join(output, "app-map-summary-large-text-fixture.png") });
    await f.page.locator(".map__list").click();
    const row = f.page.getByRole("link", { name: /Locale da menu/ });
    await row.waitFor();
    assert.match(await row.innerText(), /1 voce menu[\s\S]*Dal menu del locale/);
    assert.match(await row.locator(".row__meta").innerText(), /^Locale · Dal menu del locale/);
    const staticCafe = f.page.getByRole("link", { name: /Unpriced overlap fixture/ });
    assert.match(await staticCafe.locator(".row__meta").innerText(), /^Caffè(?: ·|$)/);
    await row.click();
    const menu = f.page.getByRole("region", { name: "Prezzi dal menu online" });
    await menu.waitFor();
    assert.match(await menu.innerText(), /Signature senza categoria[\s\S]*7,50\s*€/);
    assert.ok(await menu.locator('a[href="https://official.fixture.test/menu"]').count());
    await f.page.getByRole("dialog").getByRole("button", { name: "Chiudi", exact: true }).click();
    await openDrinks(f.page);
    const spritzResponse = f.page.waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return (
          /^\/api\/mobile\/v2\/menu\/cells\//.test(url.pathname) &&
          url.searchParams.get("categories") === "spritz" &&
          response.status() === 200
        );
      },
      { timeout: 30000 },
    );
    await f.page.getByRole("checkbox", { name: "Spritz", exact: true }).check({ force: true });
    await spritzResponse;
    await f.page.waitForFunction(
      () =>
        !document
          .querySelector("section.map")
          ?.getAttribute("data-prices-shown")
          ?.includes("1 VOCE"),
      { timeout: 30000 },
    );
    assert.ok(options.cellRequests.some((request) => request.categories.join(",") === "spritz"));
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("v2 outage preserves legacy map and retries fresh Tutti after recovery", async () => {
  const options = { menu: true, menuUnavailable: true, cellRequests: [] };
  const f = await fixture({ width: 390, height: 844 }, options);
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/?at=45.4642,9.19");
    const all = (await openDrinks(f.page)).getByRole("button", { name: "Tutti", exact: true });
    await all.click();
    assert.equal(await f.page.locator(".mobile-drink-all").getAttribute("aria-pressed"), "true");
    await f.page.waitForFunction(() =>
      document.querySelector("section.map")?.getAttribute("data-prices-shown")?.includes("PREZZI"),
    );
    assert.equal(await f.page.locator(".map__retry").count(), 0);
    assert.match(await f.page.locator(".mobile-menu-map-note").innerText(), /prezzi segnalati/);
    const initialAllRequests = options.cellRequests.filter(
      (request) => request.cell === "u0nd9" && request.categories.length === 0,
    ).length;
    assert.ok(initialAllRequests >= 1);
    options.menuUnavailable = false;
    await openDrinks(f.page);
    await f.page.getByRole("checkbox", { name: "Spritz", exact: true }).check({ force: true });
    await f.page.locator(".mobile-menu-map-note").waitFor();
    await f.page.waitForFunction(() =>
      document.querySelector("section.map")?.getAttribute("data-prices-shown")?.includes("7,50"),
    );
    await all.click();
    await f.page.waitForFunction(() =>
      document.querySelector("section.map")?.getAttribute("data-prices-shown")?.includes("1 VOCE"),
    );
    assert.equal(await f.page.locator(".mobile-drink-all").getAttribute("aria-pressed"), "true");
    assert.ok(
      options.cellRequests.filter(
        (request) => request.cell === "u0nd9" && request.categories.length === 0,
      ).length > initialAllRequests,
    );
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("a stale identity failure cannot discard a successful new selected drink", async () => {
  const options = { menu: true, holdFirstIdentity: true, cellRequests: [] };
  const f = await fixture({ width: 390, height: 844 }, options);
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/?at=45.4642,9.19");
    await (await openDrinks(f.page)).getByRole("button", { name: "Tutti", exact: true }).click();
    await f.page.waitForFunction(() =>
      document.querySelector("section.map")?.getAttribute("data-prices-shown")?.includes("PREZZI"),
    );
    assert.equal(typeof options.releaseOldIdentity, "function");
    const sampled = f.page.waitForResponse(
      (response) =>
        response.url().includes("/api/mobile/v2/menu/cells/u0nd9?categories=spritz") &&
        response.status() === 200,
      { timeout: 8000 },
    );
    const drinks = await openDrinks(f.page);
    await drinks.getByRole("checkbox", { name: "Spritz", exact: true }).check({ force: true });
    await sampled.catch((error) => {
      throw new Error(`Fresh Spritz response missing: ${JSON.stringify(options.cellRequests)}`, {
        cause: error,
      });
    });
    await f.page.getByTestId("drink-summary").getByText("Spritz").waitFor();
    options.releaseOldIdentity();
    await f.page
      .waitForFunction(
        () =>
          document
            .querySelector("section.map")
            ?.getAttribute("data-prices-shown")
            ?.includes("7,50"),
        null,
        { timeout: 8000 },
      )
      .catch((error) => {
        throw new Error(`Selected price did not recover: ${JSON.stringify(options.cellRequests)}`, {
          cause: error,
        });
      });
    assert.equal(
      options.cellRequests.filter(
        (request) => request.cell === "u0nd9" && request.categories.length === 0,
      ).length,
      2,
      "The selected drink must recover with exactly one fresh identity read",
    );
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.writes, []);
  } finally {
    options.releaseOldIdentity?.();
    await f.close();
  }
});

test("m-key detail outage offers retry instead of saying the venue does not exist", async () => {
  const options = { menu: true, detailUnavailable: true };
  const f = await fixture({ width: 390, height: 844 }, options);
  try {
    await f.page.goto(
      "https://mobile.fixture.test/mobile/?path=%2Fbar%2Fmaaaaaaaaaaaaaaaaaaaaaaaa&c=u0nd9",
    );
    await f.page.getByRole("button", { name: "Riprova", exact: true }).waitFor();
    assert.equal(await f.page.getByText("Locale non trovato").count(), 0);
    options.detailUnavailable = false;
    await f.page.getByRole("button", { name: "Riprova", exact: true }).click();
    await f.page.getByRole("heading", { name: "Locale da menu" }).waitFor();
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("selected drink venue keeps a selectable dot below price-label zoom", async () => {
  const f = await fixture();
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/?at=45.4642,9.19");
    await selectOnlyDrink(f.page, "Spritz");
    await f.page.waitForFunction(() =>
      document.querySelector("section.map")?.getAttribute("data-prices-shown")?.includes("5,50"),
    );
    const map = f.page.locator("section.map");
    const box = await map.boundingBox();
    assert.ok(box);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await f.page.mouse.move(x, y);
    await f.page.mouse.wheel(0, 650);
    await f.page.waitForFunction(
      () => Number(document.querySelector("section.map")?.getAttribute("data-zoom")) < 14,
    );
    await f.page.screenshot({ path: path.join(output, "selected-drink-low-zoom-dot-fixture.png") });
    await f.page.mouse.click(x, y);
    await f.page.locator("h2.scontrino__name").waitFor();
    assert.equal(await f.page.locator("h2.scontrino__name").textContent(), "Locale di prova");
    await f.page.getByRole("dialog").getByRole("button", { name: "Chiudi", exact: true }).click();
    await f.page.mouse.move(x, y);
    await f.page.mouse.wheel(0, -650);
    await f.page.waitForFunction(
      () => Number(document.querySelector("section.map")?.getAttribute("data-zoom")) >= 14,
    );
    await f.page.waitForFunction(
      () =>
        document.querySelector(".map__canvas")?.getAttribute("data-selected-price") === "5,50 €",
    );
    await f.page.screenshot({ path: path.join(output, "selected-drink-zoomed-cork-fixture.png") });
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("receipt actions remain in one row at 320, 390 and 430 pixels", async () => {
  const f = await fixture();
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/?path=%2Fbar%2Fn123&c=u0nd9");
    const actions = f.page.locator(".scontrino .price__actions").first().getByRole("button");
    await actions.first().waitFor();
    assert.equal(await actions.count(), 3);
    for (const width of [320, 390, 430]) {
      await f.page.setViewportSize({ width, height: 700 });
      const boxes = await Promise.all([0, 1, 2].map((i) => actions.nth(i).boundingBox()));
      assert.ok(boxes.every(Boolean), JSON.stringify(boxes));
      assert.ok(
        boxes.every((box) => Math.abs(box.y - boxes[0].y) < 2),
        JSON.stringify(boxes),
      );
      assert.ok(boxes[2].x + boxes[2].width <= width + 1, JSON.stringify(boxes));
    }
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("Italy preview remains visible while one map loads eagerly and can retry failed tiles", async () => {
  const options = { mapUnavailable: true, mapStyleRequests: [] };
  const f = await fixture({ width: 390, height: 844 }, options);
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/");
    const preview = f.page.locator(".map__preview img");
    await preview.waitFor();
    assert.equal(await preview.evaluate((img) => img.complete && img.naturalWidth > 0), true);
    assert.equal(await preview.evaluate((img) => getComputedStyle(img).visibility), "visible");
    await f.page.getByRole("button", { name: "Riprova mappa" }).waitFor();
    assert.equal(
      options.mapStyleRequests.length,
      3,
      "Map starts without a tap and uses its bounded fetch retries",
    );
    assert.equal(await f.page.locator(".map__preview").isVisible(), true);
    options.mapUnavailable = false;
    await f.page.getByRole("button", { name: "Riprova mappa" }).click();
    await f.page.waitForFunction(
      () => document.querySelector("section.map")?.getAttribute("data-ready") === "true",
    );
    assert.equal(
      options.mapStyleRequests.length,
      4,
      "Manual retry fetches the recovered style once",
    );
    assert.equal(
      await f.page.locator(".maplibregl-canvas").count(),
      1,
      "Only one replacement map remains",
    );
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("app map actions reclaim the footer and retain both contribution routes", async () => {
  const f = await fixture({ width: 430, height: 700 });
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/?at=45.4642,9.19");
    const actions = f.page.getByTestId("mobile-map-actions");
    const toggle = actions.getByRole("button", { name: "Aggiungi", exact: true });
    await toggle.waitFor();
    assert.equal(await f.page.locator(".bottom").isVisible(), false);
    const map = await f.page.locator("section.map").boundingBox();
    assert.ok(map && map.height >= 500, JSON.stringify(map));
    await f.page.getByTestId("map-status").waitFor();
    const status = await f.page.getByTestId("map-status").boundingBox();
    const actionBox = await toggle.boundingBox();
    const locate = await f.page.locator(".top__row > .icon-btn").boundingBox();
    assert.ok(status && actionBox && locate);
    assert.ok(status.y + status.height + 8 <= actionBox.y, "Add must clear coverage card");
    assert.ok(locate.y + locate.height <= actionBox.y, "Add must clear locate control");
    await toggle.click();
    await f.page.screenshot({
      path: path.join(output, "app-map-actions-iphone16plus-fixture.png"),
    });
    const choices = actions.getByRole("group", { name: "Aggiungi" });
    assert.equal(await choices.getByRole("button").count(), 2);
    for (const width of [320, 390, 430]) {
      await f.page.setViewportSize({ width, height: 700 });
      const addVenue = await choices
        .getByRole("button", { name: "Aggiungi locale mancante", exact: true })
        .boundingBox();
      const locateButton = await f.page.locator(".top__row > .icon-btn").boundingBox();
      assert.ok(addVenue && locateButton);
      assert.ok(
        addVenue.x + addVenue.width <= locateButton.x,
        `Expanded Add menu must clear locate control at ${width}px`,
      );
      const hit = await f.page.evaluate(
        ({ x, y }) =>
          document.elementFromPoint(x, y)?.closest(".mobile-map-actions__menu > .btn")?.textContent,
        { x: addVenue.x + addVenue.width - 8, y: addVenue.y + addVenue.height / 2 },
      );
      assert.match(hit ?? "", /Aggiungi locale mancante/);
    }
    await f.page.setViewportSize({ width: 430, height: 700 });
    await f.page.keyboard.press("Escape");
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    assert.equal(await toggle.evaluate((element) => element === document.activeElement), true);
    await f.page.keyboard.press("Enter");
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    await f.page.keyboard.press("Tab");
    assert.equal(
      await choices
        .getByRole("button", { name: "Aggiungi prezzo", exact: true })
        .evaluate((element) => element === document.activeElement),
      true,
    );
    await f.page.keyboard.press("Tab");
    assert.equal(
      await choices
        .getByRole("button", { name: "Aggiungi locale mancante", exact: true })
        .evaluate((element) => element === document.activeElement),
      true,
    );
    await f.page.keyboard.press("Escape");
    assert.equal(await toggle.evaluate((element) => element === document.activeElement), true);
    await toggle.click();
    await choices.getByRole("button", { name: "Aggiungi prezzo", exact: true }).click();
    const priceDialog = f.page.getByRole("dialog");
    await priceDialog.waitFor();
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await f.page.setViewportSize({ width: 430, height: 420 });
    const keyboardBox = await priceDialog.boundingBox();
    assert.ok(keyboardBox && keyboardBox.y >= 0 && keyboardBox.y + keyboardBox.height <= 420);
    await f.page.setViewportSize({ width: 430, height: 700 });

    await f.page.goto("https://mobile.fixture.test/mobile/?at=45.4642,9.19");
    const again = f.page.getByTestId("mobile-map-actions");
    await again.getByRole("button", { name: "Aggiungi", exact: true }).click();
    await again
      .getByRole("group", { name: "Aggiungi" })
      .getByRole("button", { name: "Aggiungi locale mancante", exact: true })
      .click();
    await f.page.getByRole("dialog").waitFor();
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});
