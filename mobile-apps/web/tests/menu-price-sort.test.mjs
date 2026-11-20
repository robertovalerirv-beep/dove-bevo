import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdirSync, mkdtempSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { after, before, test } from "node:test";
import { build } from "vite";
import preact from "@preact/preset-vite";
import { chromium, webkit } from "@playwright/test";
/* global window */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
let browser;
let files;

before(async () => {
  const outputRoot = path.join(here, "dist");
  mkdirSync(outputRoot, { recursive: true });
  const outDir = mkdtempSync(path.join(outputRoot, "menu-sort-"));
  assert.ok(path.resolve(outDir).startsWith(path.resolve(outputRoot) + path.sep));
  await build({
    configFile: false,
    root,
    publicDir: false,
    base: "/assets/fixtures/",
    logLevel: "silent",
    plugins: [
      preact(),
      {
        name: "test-only-drink-asset",
        resolveId(id) {
          if (id === "@mobile/drink-images") return "\0fixture-drink-images";
        },
        load(id) {
          if (id === "\0fixture-drink-images")
            return 'export const drinkImage = (code, presentation = "scene") => code === "spritz" ? (presentation === "product" ? "/fixture-product.jpg" : "/fixture-drink.jpg") : undefined;';
        },
      },
    ],
    resolve: { alias: { "@site": path.join(root, "src") } },
    build: {
      outDir,
      emptyOutDir: false,
      lib: {
        entry: path.join(root, "mobile-apps/web/components/tests/fixture.tsx"),
        formats: ["es"],
        fileName: "fixture",
      },
      cssCodeSplit: false,
      rolldownOptions: { output: { assetFileNames: "[name][extname]" } },
    },
  });
  files = new Map(readdirSync(outDir).map((name) => [name, readFileSync(path.join(outDir, name))]));
  const browserType = process.env.DOVEBEVO_BROWSER_ENGINE === "webkit" ? webkit : chromium;
  browser = await browserType.launch({
    headless: true,
    ...(process.env.DOVEBEVO_BROWSER ? { executablePath: process.env.DOVEBEVO_BROWSER } : {}),
  });
});

after(async () => {
  await browser?.close();
});

const source = {
  id: "menu-source",
  url: "https://example.com/menu",
  text_sha256: "a".repeat(64),
  checked_on: "2026-11-02",
};
function offer(id, name, amount, currency = "EUR", exponent = 2, ml = null) {
  return {
    id,
    name,
    category: "spritz",
    serving: { label: null, ml },
    amount_minor: amount,
    currency,
    currency_exponent: exponent,
    context: { kind: "regular", condition: null },
    source,
  };
}
const firstPage = [
  offer("selected", "Drink selezionato", 750),
  offer("eur-high", "Euro alto", 1000),
  offer("gbp-high", "Sterline alto", 900, "GBP"),
  offer("eur-tie-large", "Euro pari grande", 600, "EUR", 2, 500),
  offer("gbp-low", "Sterline basso", 400, "GBP"),
  offer("eur-tie-small", "Euro pari piccolo", 600, "EUR", 2, 300),
  offer("eur-low", "Euro basso", 400),
  offer("eur-exponent", "Euro decimale", 5500, "EUR", 3),
];
const secondPage = [
  offer("gbp-min", "Sterline minimo", 200, "GBP"),
  offer("eur-min", "Euro minimo", 300),
];
const expectedBefore = [
  "Euro basso",
  "Euro decimale",
  "Euro pari piccolo",
  "Euro pari grande",
  "Euro alto",
  "Sterline basso",
  "Sterline alto",
];
const expectedAfter = [
  "Euro minimo",
  "Euro basso",
  "Euro decimale",
  "Euro pari piccolo",
  "Euro pari grande",
  "Euro alto",
  "Sterline minimo",
  "Sterline basso",
  "Sterline alto",
];

async function fixture() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const writes = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    if (request.method() !== "GET") {
      writes.push(request.method() + " " + pathname);
      return route.abort();
    }
    if (pathname === "/mobile/")
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="it" data-theme="light"><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/assets/fixtures/fixture.css"></head><body><div id="fixture-root"></div><script type="module" src="/assets/fixtures/fixture.js"></script></body></html>',
      });
    if (pathname.startsWith("/assets/fixtures/")) {
      const name = path.basename(pathname);
      const data = files.get(name);
      return data
        ? route.fulfill({
            contentType: name.endsWith(".css") ? "text/css" : "text/javascript",
            body: data,
          })
        : route.abort();
    }
    if (pathname === "/fixture-drink.jpg" || pathname === "/fixture-product.jpg")
      return route.fulfill({ status: 404, body: "Image unavailable" });
    if (pathname === "/data/fixture/v/u0nd9.json")
      return route.fulfill({
        json: {
          c: [[1, "Milano"]],
          v: [["n123", "Locale di prova", 1, 45.4642, 9.19, "Via di prova 1", 0]],
        },
      });
    if (pathname === "/api/prices/u0nd9")
      return route.fulfill({ json: { p: [], u: [], pend: [], h: [], g: [] } });
    if (pathname.startsWith("/api/venues/")) return route.fulfill({ json: { p: [], h: [] } });
    if (pathname.startsWith("/api/mobile/v2/customer-prices/venues/"))
      return route.fulfill({
        json: {
          schema_version: 1,
          venue: { key: "n123", cell: "u0nd9", name: "Locale di prova", country: "IT" },
          price_scope: "customer_reported_drink_item",
          rows: [],
          next_after: null,
        },
      });
    if (pathname.startsWith("/api/mobile/v2/drink-votes/venues/"))
      return route.fulfill({
        json: {
          schema_version: 1,
          venue: { key: "n123", cell: "u0nd9", name: "Locale di prova" },
          items: [],
        },
      });
    if (pathname.startsWith("/api/mobile/v2/menu/venues/"))
      return route.fulfill({
        json: {
          schema_version: 2,
          coverage: { complete: false, basis: "verified_source_items_only" },
          price_scope: "menu_item_only",
          venue: {
            key: "n123",
            cell: "u0nd9",
            name: "Locale di prova",
            kind: 1,
            lat: 45.4642,
            lon: 9.19,
            address: "Via di prova 1",
            city: "Milano",
            country: "IT",
          },
          stored_offer_count: 10,
          offers: url.searchParams.has("after") ? secondPage : firstPage,
          next_after: url.searchParams.has("after") ? null : "eur-exponent",
          fees: [],
          fee_coverage: { status: "unknown", source: null },
          minimum_spends: [],
        },
      });
    return route.abort();
  });
  await page.goto("https://sheets.fixture.test/mobile/?path=%2Fbar%2Fn123&c=u0nd9&offer=selected");
  await page.waitForFunction(() => window.sheetFixture);
  await page.evaluate(() => window.sheetFixture.bar([], "n123"));
  return { page, writes, close: () => context.close() };
}

async function listedNames(page) {
  return page
    .locator(
      "details.mobile-menu-v2__more-offers:not(.mobile-menu-v2__selected-details) > ul.mobile-menu-v2__offers > li.mobile-menu-v2__offer .mobile-menu-v2__name",
    )
    .evaluateAll((nodes) => nodes.map((node) => node.childNodes[0]?.textContent?.trim()));
}

test("menu prices sort within their original currency while selected drink stays prominent", async () => {
  const f = await fixture();
  try {
    await f.page.locator('[data-testid="featured-menu-price"]').waitFor();
    const selected = f.page.locator('[data-testid="featured-menu-price"]');
    assert.match(await selected.innerText(), /Drink selezionato[\s\S]*7,50/);
    const otherPrices = f.page
      .locator("details.mobile-menu-v2__more-offers")
      .filter({ hasText: "Altri prezzi dal menu" });
    await otherPrices.locator(":scope > summary").click();
    assert.deepEqual(await listedNames(f.page), expectedBefore);
    assert.match(
      await f.page.locator(".mobile-menu-v2__sort-scope").innerText(),
      /per valuta.*Carica altri drink/,
    );
    await f.page.getByRole("button", { name: "Vedi altri drink" }).click();
    await f.page
      .locator(".mobile-menu-v2__name")
      .filter({ hasText: "Euro minimo" })
      .waitFor({ state: "attached" });
    assert.deepEqual(await listedNames(f.page), expectedAfter);
    assert.equal(await selected.count(), 1);
    assert.equal(await f.page.locator(".mobile-menu-v2__sort-scope").count(), 0);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("partial menu ordering is explained in English as well", async () => {
  const f = await fixture();
  try {
    await f.page.evaluate(() => {
      window.sheetFixture.setLang("en");
      window.sheetFixture.bar([], "n123");
    });
    await f.page.locator(".mobile-menu-v2__sort-scope").waitFor();
    assert.match(
      await f.page.locator(".mobile-menu-v2__sort-scope").innerText(),
      /Loaded menu prices are in ascending order within each currency.*Load more drinks/,
    );
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});
