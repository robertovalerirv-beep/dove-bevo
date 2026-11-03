import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdirSync, mkdtempSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { after, before, test } from "node:test";
import { build } from "vite";
import preact from "@preact/preset-vite";
import { chromium } from "@playwright/test";
/* global window, document */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
let browser, files;
before(async () => {
  const output = path.join(root, "mobile-apps/web/.build/search-tests");
  mkdirSync(output, { recursive: true });
  const outDir = mkdtempSync(path.join(output, "run-"));
  await build({
    configFile: false,
    root,
    publicDir: false,
    base: "/assets/fixture/",
    logLevel: "silent",
    plugins: [preact()],
    resolve: { alias: { "@site": path.join(root, "src") } },
    build: {
      outDir,
      emptyOutDir: false,
      cssCodeSplit: false,
      lib: { entry: path.join(here, "search.fixture.tsx"), formats: ["es"], fileName: "fixture" },
      rolldownOptions: { output: { assetFileNames: "[name][extname]" } },
    },
  });
  files = new Map(readdirSync(outDir).map((name) => [name, readFileSync(path.join(outDir, name))]));
  browser = await chromium.launch({
    headless: true,
    ...(process.env.DOVEBEVO_BROWSER ? { executablePath: process.env.DOVEBEVO_BROWSER } : {}),
  });
});
after(async () => {
  await browser?.close();
});

async function fixture({ width = 393, failed = false, prefill = true, placeNames, catalog } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 690 } });
  const page = await context.newPage();
  const writes = [],
    errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const names = placeNames ?? [
    "Milano",
    "Milano Centro",
    "Milano Nord",
    "Milano Sud",
    "Milano Est",
    "Milano Ovest",
    "Milano Città",
    "Milano Provincia",
  ];
  await page.route("**/*", (route) => {
    const request = route.request(),
      pathname = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      writes.push(request.method());
      return route.abort();
    }
    if (pathname === "/")
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="it" data-theme="light" data-dovebevo-mobile-shell="1"><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/assets/fixture/fixture.css"></head><body><div id="app"></div><script type="module" src="/assets/fixture/fixture.js"></script></body></html>',
      });
    if (pathname.startsWith("/assets/fixture/")) {
      const name = path.basename(pathname),
        data = files.get(name);
      return data
        ? route.fulfill({
            contentType: name.endsWith(".css") ? "text/css" : "text/javascript",
            body: data,
          })
        : route.abort();
    }
    if (pathname === "/data/fixture/places.json")
      return route.fulfill({
        json: names.map((name, index) => [index + 1, name, 45.46, 9.19, 10]),
      });
    if (pathname === "/mobile-data/catalog.json")
      return catalog ? route.fulfill({ json: catalog }) : route.fulfill({ status: 503, json: {} });
    if (pathname.startsWith("/data/fixture/s/"))
      return route.fulfill({ status: failed ? 503 : 200, json: [] });
    if (pathname.startsWith("/api/")) return route.fulfill({ json: [] });
    return route.abort();
  });
  await page.goto("https://search.fixture.test/");
  const input = page.getByRole("combobox");
  if (prefill) {
    await input.fill("Milano");
    await page.getByRole("option").nth(7).waitFor();
  }
  return { page, input, writes, errors, close: () => context.close() };
}

test("empty search suggests real major Italian cities before European cities", async () => {
  const placeNames = [
    "Bari",
    "Paris",
    "Napoli",
    "Roma",
    "Milano",
    "Torino",
    "Bologna",
    "Firenze",
    "Venezia",
    "Genova",
    "Palermo",
  ];
  const catalog = {
    schema_version: 1,
    version: "fixture-europe-v1",
    venues: [
      {
        key: "n1001",
        name: "Fixture London pub",
        kind: 1,
        lat: 51.5074,
        lon: -0.1278,
        cell: "gcpvj",
        city: "London",
        country: "GB",
        currency: "GBP",
        google: {
          url: "https://www.google.com/maps?cid=1001",
          review_count: 101,
          checked_on: "2026-11-01",
        },
      },
      {
        key: "n2001",
        name: "Fixture Paris bar",
        kind: 1,
        lat: 48.8566,
        lon: 2.3522,
        cell: "u09tv",
        city: "Paris",
        country: "FR",
        currency: "EUR",
        google: {
          url: "https://www.google.com/maps?cid=2001",
          review_count: 300,
          checked_on: "2026-11-01",
        },
      },
    ],
  };
  const f = await fixture({ prefill: false, placeNames, catalog });
  try {
    const sections = f.page.locator(".mobile-search__results > h3.section-title + ul.rows");
    await sections.nth(1).getByText("London").waitFor();
    assert.deepEqual(await sections.nth(0).locator(".row__name").allTextContents(), [
      "Milano",
      "Roma",
      "Torino",
      "Napoli",
      "Firenze",
      "Bologna",
      "Venezia",
      "Genova",
      "Palermo",
      "Bari",
    ]);
    assert.deepEqual(await sections.nth(1).locator(".row__name").allTextContents(), [
      "London",
      "Paris",
    ]);
    await sections.nth(0).getByRole("button", { name: /Roma/ }).click();
    assert.equal(await f.page.locator("#app").getAttribute("data-selected"), "Roma");
    await f.input.fill("Paris");
    assert.equal(await sections.count(), 0, "Typing switches to the broad search results");
    await f.page.getByRole("option", { name: /Paris/ }).first().waitFor();
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

async function visibleTogether(page) {
  return page.evaluate(() => {
    const input = document.querySelector('[role="combobox"]').getBoundingClientRect();
    const first = document.querySelector('[role="option"]').getBoundingClientRect();
    const dialog = document.querySelector("dialog");
    return {
      inputTop: input.top,
      inputBottom: input.bottom,
      firstTop: first.top,
      firstBottom: first.bottom,
      height: window.innerHeight,
      scroll: dialog.scrollTop,
      pageScroll: window.scrollY,
    };
  });
}

test("search and first city stay visible as the native keyboard reduces viewport", async () => {
  for (const width of [320, 393]) {
    const f = await fixture({ width, failed: true });
    try {
      await f.page.getByRole("alert").waitFor();
      for (const height of [690, 400, 320, 260, 220, 400, 690]) {
        await f.page.setViewportSize({ width, height });
        const boxes = await visibleTogether(f.page);
        assert.ok(boxes.inputTop >= 0 && boxes.inputBottom <= height, JSON.stringify(boxes));
        assert.ok(
          boxes.firstTop >= boxes.inputBottom && boxes.firstBottom <= height,
          JSON.stringify(boxes),
        );
        assert.equal(boxes.scroll, 0);
        assert.equal(boxes.pageScroll, 0);
        await f.input.focus();
        assert.equal(await f.input.inputValue(), "Milano");
      }
      assert.deepEqual(f.errors, []);
      assert.deepEqual(f.writes, []);
    } finally {
      await f.close();
    }
  }
});

test("scrolling city results keeps search pinned and a new query reveals its first result", async () => {
  const f = await fixture();
  try {
    await f.page.setViewportSize({ width: 393, height: 320 });
    const initial = await f.input.boundingBox();
    await f.page.getByRole("option").last().scrollIntoViewIfNeeded();
    assert.deepEqual(
      await f.input.boundingBox(),
      initial,
      "Scrolling results must not hide the input",
    );
    assert.equal(await f.page.locator("dialog").evaluate((node) => node.scrollTop), 0);
    await f.input.fill("Milano Centro");
    await f.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 1);
    const boxes = await visibleTogether(f.page);
    assert.ok(
      boxes.firstTop >= boxes.inputBottom && boxes.firstBottom <= boxes.height,
      JSON.stringify(boxes),
    );
    await f.page.getByRole("option").click();
    assert.equal(await f.page.locator("#app").getAttribute("data-selected"), "Milano Centro");
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("arrow navigation scrolls only results while focus stays on the original search field", async () => {
  const f = await fixture();
  try {
    await f.page.setViewportSize({ width: 393, height: 320 });
    const initial = await f.input.boundingBox();
    for (let index = 0; index < 8; index++) {
      await f.input.press("ArrowDown");
      const active = await f.input.getAttribute("aria-activedescendant");
      assert.ok(active);
      const row = f.page.locator(`[id="${active}"]`);
      assert.equal(await row.getAttribute("aria-selected"), "true");
      const box = await row.boundingBox();
      assert.ok(
        box.y >= initial.y + initial.height && box.y + box.height <= 320,
        JSON.stringify(box),
      );
      assert.deepEqual(await f.input.boundingBox(), initial);
      assert.equal(await f.input.evaluate((node) => node === document.activeElement), true);
      assert.equal(await f.page.locator("dialog").evaluate((node) => node.scrollTop), 0);
    }
    await f.input.press("Enter");
    assert.equal(await f.page.locator("#app").getAttribute("data-selected"), "Milano Provincia");
    await f.input.press("Escape");
    assert.equal(await f.input.inputValue(), "");
    await f.input.press("Escape");
    assert.equal(await f.page.locator("dialog").count(), 0);
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});
