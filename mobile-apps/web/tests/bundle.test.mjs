import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import path from "node:path";
import { before, after, test } from "node:test";
import { chromium } from "@playwright/test";
import { contrastRatio } from "./contrast.mjs";
import { pageCsp } from "../../../src/worker/lib/security-headers.ts";
/* global document, getComputedStyle, history */

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
    )
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
    if (/^\/data\/fixture\/v\/[0-9a-z]{5}\.json$/.test(url.pathname))
      return route.fulfill({
        json: url.pathname.endsWith("u0nd9.json")
          ? {
              c: [[62505581, "Milano"]],
              v: [
                ["n123", "Locale di prova", 1, 45.4642, 9.19, "Via di prova 1", 0],
                ["n456", "Altro locale di prova", 1, 45.4652, 9.195, "Via di prova 2", 0],
                ["n789", "Unpriced overlap fixture", 1, 45.4647, 9.19, "Via di prova 3", 0],
              ],
            }
          : { c: [], v: [] },
      });
    if (options.menu && /^\/api\/mobile\/v2\/menu\/cells\//.test(url.pathname)) {
      const cell = url.pathname.split("/").at(-1);
      const categories = (url.searchParams.get("categories") ?? "").split(",").filter(Boolean);
      options.cellRequests?.push({ cell, categories: [...categories] });
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
    if (options.menu && url.pathname === "/api/mobile/v2/menu/venues/maaaaaaaaaaaaaaaaaaaaaaaa") {
      if (options.detailUnavailable) return route.fulfill({ status: 503, body: "Unavailable" });
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
            key: "maaaaaaaaaaaaaaaaaaaaaaaa",
            cell: "u0nd9",
            name: "Locale da menu",
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
    if (/^\/api\/prices\//.test(url.pathname))
      return route.fulfill({
        json: { p: url.pathname.endsWith("u0nd9") ? rows : [], u: [], pend: [], h: [], g: [] },
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

test("production mobile entry renders chips and preserves venue route across reload and close", async () => {
  const f = await fixture();
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/?path=%2Fbar%2Fn123&c=u0nd9");
    const name = f.page.locator("h2.scontrino__name");
    await name.waitFor();
    assert.equal(await name.textContent(), "Locale di prova");
    assert.match(await f.page.locator(".mobile-price--featured").innerText(), /Spritz[\s\S]*5,50/);
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
    const chips = f.page.locator(".mobile-drink-strip");
    assert.equal(await chips.getByRole("checkbox").count(), 9);
    assert.equal(
      await chips.getByRole("button", { name: "Tutti", exact: true }).getAttribute("aria-pressed"),
      "true",
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
      "true",
    );
    const selected = await chips.locator("label:has(input:checked)").evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      text: getComputedStyle(el).color,
    }));
    assert.deepEqual(selected, { bg: "rgb(255, 90, 31)", text: "rgb(16, 24, 32)" });
    await chips.getByRole("checkbox", { name: "Spritz", exact: true }).focus();
    await f.page.keyboard.press("Space");
    assert.equal(
      await chips.getByRole("checkbox", { name: "Spritz", exact: true }).isChecked(),
      true,
    );
    await chips.getByText("Birra media", { exact: true }).click();
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
    await f.page.locator(".search-field").click();
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

test("orange mobile controls retain readable selected, unselected and focused drink chips", async () => {
  const f = await fixture();
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/");
    const strip = f.page.locator(".mobile-drink-strip");
    await strip.waitFor();
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
      assert.ok(contrastRatio(colors.outline, "rgb(255, 255, 255)") >= 4.5, JSON.stringify(colors));
    }
    const primary = await f.page.locator(".bottom .btn--primary").evaluate((button) => ({
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

test("Tutti reveals uncategorized verified menus without inventing a drink price", async () => {
  const options = { menu: true, uncategorized: true, cellRequests: [] };
  const f = await fixture({ width: 390, height: 844 }, options);
  try {
    await f.page.goto("https://mobile.fixture.test/mobile/?at=45.4642,9.19");
    const all = f.page.getByRole("button", { name: "Tutti", exact: true });
    assert.equal(await all.getAttribute("aria-pressed"), "true");
    await f.page.waitForFunction(
      () =>
        document
          .querySelector("section.map")
          ?.getAttribute("data-prices-shown")
          ?.includes("1 VOCE"),
      { timeout: 30000 },
    );
    assert.match(
      await f.page.getByTestId("map-status").innerText(),
      /3 bar su 4 qui hanno un prezzo/,
    );
    assert.match(
      await f.page.locator(".mobile-menu-map-note").innerText(),
      /voci di menu verificate/,
    );
    await f.page.locator(".map__list").click();
    const row = f.page.getByRole("link", { name: /Locale da menu/ });
    await row.waitFor();
    assert.match(await row.innerText(), /1 voce menu[\s\S]*Dal menu del locale/);
    await row.click();
    const menu = f.page.getByRole("region", { name: "Prezzi dal menu online" });
    await menu.waitFor();
    assert.match(await menu.innerText(), /Signature senza categoria[\s\S]*7,50\s*€/);
    assert.ok(await menu.locator('a[href="https://official.fixture.test/menu"]').count());
    await f.page.getByRole("dialog").getByRole("button", { name: "Chiudi", exact: true }).click();
    await f.page.getByRole("checkbox", { name: "Spritz", exact: true }).check({ force: true });
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
    const all = f.page.getByRole("button", { name: "Tutti", exact: true });
    assert.equal(await all.getAttribute("aria-pressed"), "true");
    await f.page.waitForFunction(() =>
      document.querySelector("section.map")?.getAttribute("data-prices-shown")?.includes("PREZZI"),
    );
    assert.equal(await f.page.locator(".map__retry").count(), 0);
    assert.equal(await f.page.locator(".mobile-menu-map-note").count(), 0);
    const initialAllRequests = options.cellRequests.filter(
      (request) => request.cell === "u0nd9" && request.categories.length === 0,
    ).length;
    assert.ok(initialAllRequests >= 1);
    options.menuUnavailable = false;
    await f.page.getByRole("checkbox", { name: "Spritz", exact: true }).check({ force: true });
    await f.page.locator(".mobile-menu-map-note").waitFor();
    await f.page.waitForFunction(() =>
      document.querySelector("section.map")?.getAttribute("data-prices-shown")?.includes("7,50"),
    );
    await all.click();
    await f.page.waitForFunction(() =>
      document.querySelector("section.map")?.getAttribute("data-prices-shown")?.includes("1 VOCE"),
    );
    assert.equal(await all.getAttribute("aria-pressed"), "true");
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
