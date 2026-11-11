import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath, URL, URLSearchParams } from "node:url";
import path from "node:path";
import { before, after, test } from "node:test";
import { chromium } from "@playwright/test";
import { contrastRatio } from "./contrast.mjs";
import { pageCsp } from "../../../src/worker/lib/security-headers.ts";
/* global document, structuredClone, getComputedStyle, history, location, window, Event */

// Synthetic records exist only inside intercepted requests. No public read/write is used.
const client = path.resolve(fileURLToPath(new URL("../../../dist/client/", import.meta.url)));
const output = fileURLToPath(new URL("../test-results/", import.meta.url));
const origin = "https://mobile.fixture.test";
const catalog = {
  schema_version: 1,
  version: "fixture-europe-v1",
  venues: [
    {
      key: "n1001",
      name: 'Fixture <pub> & "bar"',
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
      key: "n1002",
      name: "Other fixture pub",
      kind: 1,
      lat: 51.5084,
      lon: -0.1278,
      cell: "gcpvj",
      city: "London",
      country: "GB",
      currency: "GBP",
      google: {
        url: "https://www.google.com/maps?cid=1002",
        review_count: 120,
        checked_on: "2026-11-01",
      },
    },
    {
      key: "n2001",
      name: "Paris fixture bar",
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
let serial = 1;
function price(venue, drink, amount, serving, customer = false, extras = {}) {
  return {
    venue: venue.key,
    cell: venue.cell,
    drink,
    hh: 0,
    currency: venue.currency,
    amount_minor: amount,
    serving,
    observed_on: customer ? "2026-11-01" : null,
    confirmed_on: null,
    confirmations: 2,
    status: "active",
    revision: `00000000-0000-4000-8000-${String(serial++).padStart(12, "0")}`,
    provenance: customer
      ? {
          kind: "customer",
          source_url: null,
          source_checked_on: null,
          source_sha256: null,
          menu_item: null,
        }
      : {
          kind: "online_menu",
          source_url: "https://official.fixture.test/drinks.pdf",
          source_checked_on: "2026-11-01",
          source_sha256: "a".repeat(64),
          menu_item: "Spritz <menu> · HH Mon–Fri 17–19",
        },
    ...extras,
  };
}
const rows = [
  price(catalog.venues[0], "spritz", 750, { unit: "drink" }),
  price(catalog.venues[0], "beer_draft", 500, { unit: "ml", ml: 400 }, true),
  price(catalog.venues[0], "beer_draft", 700, { unit: "ml", ml: 568 }),
  price(catalog.venues[1], "beer_draft", 650, { unit: "ml", ml: 568 }),
  price(catalog.venues[1], "beer_draft", 100, { unit: "ml", ml: 400 }, false, {
    status: "quarantined",
  }),
  price(catalog.venues[2], "spritz", 900, { unit: "drink" }),
];
let browser;
before(async () => {
  assert.ok(existsSync(path.join(client, "mobile/index.html")), "Build production bundle first");
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

async function fixture(options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 390, height: 844 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage(),
    writes = [],
    errors = [],
    external = [],
    reads = [],
    voteReads = [],
    voteStates = new Map();
  let catalogReads = 0;
  let voteReadCount = 0,
    voteWriteCount = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  // Emulate Safari 16's missing size member, in addition to the pure route regression test.
  await page.addInitScript(() => {
    delete URLSearchParams.prototype.size;
  });
  await page.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin) {
      external.push(url.href);
      if (url.href === "https://tiles.openfreemap.org/planet")
        return route.fulfill({ json: { tiles: [] } });
      if (url.origin === "https://challenges.cloudflare.com")
        return route.fulfill({
          contentType: "text/javascript",
          body: 'window.turnstile={render:(host,options)=>{setTimeout(()=>options.callback("fixture-only-token"),0);return "fixture"},remove:()=>{}};',
        });
      return route.abort();
    }
    if (request.method() !== "GET") {
      const record = { path: url.pathname, body: request.postDataJSON() };
      writes.push(record);
      if (url.pathname.startsWith("/api/mobile/v2/drink-votes/venues/")) {
        voteWriteCount++;
        const { target, recommended } = record.body;
        assert.equal(request.headers()["x-dovebevo-voter"]?.length, 36);
        const identity = JSON.stringify(target);
        if (options.voteFailPostOnce && voteWriteCount === 1)
          return route.fulfill({ status: 503, json: { error: "fixture_vote_failure" } });
        if (recommended) voteStates.set(identity, { target, count: 1, recommended: true });
        else voteStates.delete(identity);
        if (options.voteCommitThenFailOnce && voteWriteCount === 1)
          return route.fulfill({ status: 503, json: { error: "fixture_lost_response" } });
        return route.fulfill({ json: { target, count: recommended ? 1 : 0, recommended } });
      }
      if (url.pathname === "/api/session") return route.fulfill({ json: { ok: true } });
      if (options.first401 && writes.filter((v) => v.path === url.pathname).length === 1)
        return route.fulfill({ status: 401, json: { error: "session" } });
      if (url.pathname === "/api/mobile/prices/confirm") {
        if (options.holdConfirm) await options.holdConfirm;
        return route.fulfill({
          status: options.confirmConflict ? 409 : 200,
          json: options.confirmConflict
            ? { error: "conflict" }
            : { status: "confirmed", confirmations: 3 },
        });
      }
      if (url.pathname === "/api/mobile/prices/report")
        return route.fulfill({ json: { status: "reported" } });
      if (url.pathname === "/api/mobile/prices")
        return route.fulfill({ json: { results: [{ status: "active" }] } });
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
    reads.push(url.pathname);
    if (url.pathname.startsWith("/api/mobile/v2/drink-votes/venues/")) {
      voteReadCount++;
      voteReads.push(url.href);
      if (options.voteFailReadOnce && voteReadCount === 1)
        return route.fulfill({ status: 503, json: { error: "fixture_vote_failure" } });
      return route.fulfill({
        json: {
          schema_version: 1,
          venue: {
            key: url.pathname.split("/").at(-1),
            cell: url.searchParams.get("cell"),
            name: catalog.venues.find((v) => v.key === url.pathname.split("/").at(-1))?.name ?? "",
          },
          items: [...voteStates.values()],
        },
      });
    }
    if (url.pathname === "/mobile-data/catalog.json") {
      catalogReads++;
      return route.fulfill({
        json:
          typeof options.catalog === "function"
            ? options.catalog(catalogReads)
            : (options.catalog ?? catalog),
      });
    }
    if (url.pathname === "/api/session")
      return route.fulfill({ json: { siteKey: "fixture", action: "contribute" } });
    if (url.pathname.startsWith("/api/mobile/prices/venues/")) {
      if (options.holdVenue) await options.holdVenue;
      return route
        .fulfill({
          json: {
            schema_version: 1,
            catalog_version: catalog.version,
            rows: [],
            hidden: [],
            legacy_venues: [],
          },
        })
        .catch(() => {});
    }
    if (url.pathname.startsWith("/api/mobile/prices/cells/")) {
      const cell = url.pathname.split("/").at(-1);
      const value = {
        schema_version: 1,
        catalog_version: catalog.version,
        rows: rows.filter((r) => r.cell === cell),
        hidden: [],
        legacy_venues: [],
      };
      if (options.snapshot) options.snapshot(value, cell, catalogReads);
      if (options.hold && cell === "gcpvj") await options.hold;
      return route.fulfill({ json: value }).catch(() => {});
    }
    if (/^\/assets\/mobile\/mobile-map-.*\.json$/.test(url.pathname))
      return route.fulfill({
        json: {
          version: 8,
          sources: {},
          glyphs: origin + "/empty/{fontstack}/{range}.pbf",
          layers: [
            { id: "background", type: "background", paint: { "background-color": "#f5f6f3" } },
          ],
        },
      });
    if (url.pathname === "/data/fixture/places.json") return route.fulfill({ json: [] });
    if (/^\/data\/fixture\/v\/[0-9a-z]{5}\.json$/.test(url.pathname))
      return route.fulfill({ json: { c: [], v: [] } });
    if (url.pathname.startsWith("/api/prices/"))
      return route.fulfill({ json: { p: [], u: [], pend: [], h: [], g: [] } });
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
  return { page, writes, errors, external, reads, voteReads, close: () => context.close() };
}
async function openLondon(f, venue = true) {
  await f.page.goto(
    origin + (venue ? "/mobile/?path=%2Fbar%2Fn1001&c=gcpvj" : "/mobile/?at=51.5074,-0.1278"),
  );
  if (venue)
    await f.page
      .locator("h2.scontrino__name")
      .waitFor({ timeout: 8000 })
      .catch(async (error) => {
        throw new Error(
          `${error.message}\nDOM: ${await f.page.locator("body").innerText()}\nErrors: ${JSON.stringify(f.errors)}`,
        );
      });
  else
    await f.page.waitForFunction(
      () => !document.querySelector(".europe-coverage")?.textContent.includes("Caricamento"),
    );
  await f.page
    .getByRole("combobox", { name: "Scegli cosa bere", exact: true })
    .selectOption("spritz");
}
async function changeCity(page, name) {
  await page.locator('.europe-app button[data-dovebevo-search="1"]').click();
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
}
async function addPrice(f) {
  await f.page
    .getByRole("dialog")
    .getByRole("button", { name: "Aggiungi un prezzo qui", exact: true })
    .click();
  await f.page.locator(".europe-price-form").waitFor();
}

test("European venue preserves identity, explicit pounds and source-check provenance on the production entry", async () => {
  const f = await fixture();
  try {
    await openLondon(f);
    assert.equal(await f.page.locator("h2.scontrino__name").textContent(), catalog.venues[0].name);
    assert.equal(
      await f.page.locator("dialog.sheet--bare").getAttribute("aria-label"),
      catalog.venues[0].name,
    );
    assert.equal(await f.page.locator(".map").count(), 1);
    assert.equal(await f.page.locator(".map").getAttribute("data-selected"), "n1001");
    await f.page.waitForFunction(
      () => document.querySelector(".map")?.getAttribute("data-ready") === "true",
    );
    assert.match(
      await f.page.locator(".map").getAttribute("data-center"),
      /^-?\d{1,2}\.\d{5},-?\d{1,3}\.\d{5}$/,
    );
    assert.match(await f.page.locator(".map").getAttribute("data-zoom"), /^\d{1,2}\.\d$/);
    assert.match(await f.page.locator(".bar__addr").innerText(), /London · GBP/);
    const featured = f.page.locator(".mobile-price--featured");
    const share = await featured.evaluate((row) => ({ ...row.dataset }));
    assert.equal(share.dovebevoShare, "1");
    assert.equal(share.venue, "n1001");
    assert.equal(share.venueName, catalog.venues[0].name);
    assert.equal(share.amountMinor, "750");
    assert.equal(share.currency, "GBP");
    assert.equal(share.serving, "Drink singolo");
    assert.equal(share.hh, "0");
    assert.equal(share.confirmations, "2");
    assert.match(
      share.provenance,
      /Da menu online.*Fonte verificata.*Spritz <menu> · HH Mon–Fri 17–19/,
    );
    const secondaryMenu = f.page
      .locator(".mobile-price:not(.mobile-price--featured)")
      .filter({ hasText: "568 ml" })
      .getByRole("link", { name: "Menu", exact: true });
    await f.page
      .context()
      .route("https://official.fixture.test/drinks.pdf", (route) =>
        route.fulfill({ contentType: "text/html", body: "Owned menu fixture" }),
      );
    const popupPromise = f.page.waitForEvent("popup");
    await secondaryMenu.click();
    const menuPopup = await popupPromise;
    await menuPopup.waitForURL("https://official.fixture.test/drinks.pdf");
    await menuPopup.close();
    assert.equal(await f.page.locator(".mobile-price--expanded").count(), 0);
    assert.match(
      await featured.innerText(),
      /Spritz[\s\S]*7,50[\s\S]*Fonte verificata[\s\S]*Spritz <menu> · HH Mon–Fri 17–19/,
    );
    assert.equal(
      await featured
        .locator(".price__meta")
        .innerText()
        .then((v) => v.includes("Segnalato il")),
      false,
    );
    assert.equal(
      await featured.getByRole("link", { name: "Menu", exact: true }).getAttribute("href"),
      "https://official.fixture.test/drinks.pdf",
    );
    assert.equal(
      await f.page
        .locator(".europe-venue")
        .innerText()
        .then((v) => v.includes("€")),
      false,
    );
    assert.equal(
      await featured.locator("menu").count(),
      0,
      "menu item is text, never injected HTML",
    );
    await f.page.reload();
    await f.page.locator("h2.scontrino__name").waitFor();
    assert.equal(new URL(f.page.url()).searchParams.get("path"), "/bar/n1001");
    await f.page.screenshot({ path: path.join(output, "europe-venue-fixture.png") });
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("European focused deep links feature exact band and describe an unsaved missing row neutrally", async () => {
  const f = await fixture();
  try {
    await f.page.goto(origin + "/mobile/?path=%2Fbar%2Fn1001&c=gcpvj&drink=spritz&hh=0");
    await f.page.locator("h2.scontrino__name").waitFor();
    assert.match(await f.page.locator(".mobile-price--featured").innerText(), /7,50/);
    assert.equal(await f.page.getByTestId("saved-drink-unavailable").count(), 0);

    await f.page.goto(origin + "/mobile/?path=%2Fbar%2Fn1001&c=gcpvj&drink=spritz&hh=1");
    await f.page.getByTestId("saved-drink-unavailable").waitFor();
    assert.match(
      await f.page.getByTestId("saved-drink-unavailable").innerText(),
      /prezzo selezionato/,
    );
    assert.doesNotMatch(
      await f.page.getByTestId("saved-drink-unavailable").innerText(),
      /prezzo salvato/,
    );
    assert.equal(await f.page.locator(".mobile-price--featured").count(), 0);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("all nine price categories load genuine artwork and keep the small-screen Save action reachable", async () => {
  const f = await fixture({ viewport: { width: 402, height: 600 } });
  try {
    await openLondon(f);
    await addPrice(f);
    const select = f.page.getByRole("combobox", { name: "Cosa hai bevuto?" });
    const images = new Set();
    for (const code of [
      "spritz",
      "beer_draft",
      "gin_tonic",
      "gin_lemon",
      "negroni",
      "sbagliato",
      "wine_glass",
      "alcohol_free",
      "water",
    ]) {
      await select.selectOption(code);
      const image = f.page.locator(".mobile-price-form__art img");
      await image.evaluate((element) => element.decode());
      const dimensions = await image.evaluate((element) => ({
        width: element.naturalWidth,
        height: element.naturalHeight,
        visibleHeight: element.getBoundingClientRect().height,
        src: element.currentSrc,
      }));
      assert.ok(dimensions.width >= 1000 && dimensions.height >= 1000);
      assert.equal(dimensions.visibleHeight, 88);
      images.add(dimensions.src);
    }
    assert.equal(images.size, 8, "Gin lemon shares the generic lemon-garnished gin image");
    await f.page
      .getByRole("button", { name: "Salva prezzo", exact: true })
      .scrollIntoViewIfNeeded();
    assert.equal(
      await f.page.getByRole("button", { name: "Salva prezzo", exact: true }).isVisible(),
      true,
    );
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("beer formats and quarantined prices are never merged into one cheap price", async () => {
  const f = await fixture();
  try {
    await openLondon(f, false);
    await f.page
      .getByRole("combobox", { name: "Scegli cosa bere", exact: true })
      .selectOption("beer_draft");
    const formats = f.page.getByRole("combobox", { name: "Formato da confrontare" });
    assert.deepEqual(await formats.locator("option").allTextContents(), ["400 ml", "568 ml"]);
    assert.equal(await formats.inputValue(), "ml:400");
    await f.page.getByRole("button", { name: "Elenco locali", exact: true }).click();
    let list = f.page.getByRole("dialog");
    assert.match(await list.getByRole("button", { name: /^Fixture/ }).innerText(), /5,00/);
    assert.match(await list.getByRole("button", { name: /^Other/ }).innerText(), /Nessun prezzo/);
    await list.getByRole("button", { name: "Chiudi", exact: true }).click();
    await formats.selectOption("ml:568");
    await f.page.getByRole("button", { name: "Elenco locali", exact: true }).click();
    list = f.page.getByRole("dialog");
    assert.match(await list.getByRole("button", { name: /^Fixture/ }).innerText(), /7,00/);
    assert.match(await list.getByRole("button", { name: /^Other/ }).innerText(), /6,50/);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("late London response cannot replace Paris currency or prices", async () => {
  let release;
  const hold = new Promise((resolve) => {
    release = resolve;
  });
  const f = await fixture({ hold });
  try {
    await f.page.goto(origin + "/mobile/?at=51.5074,-0.1278");
    await f.page.locator(".europe-app").waitFor();
    await changeCity(f.page, "Paris");
    await f.page.waitForFunction(
      () => !document.querySelector(".europe-coverage")?.textContent.includes("Caricamento"),
    );
    release();
    await f.page.getByRole("button", { name: "Elenco locali", exact: true }).click();
    await f.page
      .getByRole("dialog")
      .getByRole("button", { name: /^Paris fixture/ })
      .click();
    assert.match(await f.page.locator(".bar__addr").innerText(), /Paris · EUR/);
    assert.match(await f.page.locator(".mobile-price--featured").innerText(), /9,00\s*€/);
    assert.equal(
      await f.page
        .locator(".europe-venue")
        .innerText()
        .then((v) => v.includes("£")),
      false,
    );
    assert.equal(new URL(f.page.url()).searchParams.get("c"), "u09tv");
    assert.deepEqual(f.errors, []);
  } finally {
    release();
    await f.close();
  }
});

test("wrong currency or catalogue version fails closed without contribution controls", async () => {
  for (const mismatch of ["currency", "version", "paid-date"]) {
    const f = await fixture({
      snapshot: (value, cell) => {
        if (cell !== "gcpvj") return;
        // Clone because fixture rows themselves are shared immutable input.
        value.rows = structuredClone(value.rows);
        if (mismatch === "currency") value.rows[0].currency = "EUR";
        else if (mismatch === "version") value.catalog_version = "wrong-version";
        else value.rows[0].observed_on = "2026-11-01";
      },
    });
    try {
      await f.page.goto(origin + "/mobile/?path=%2Fbar%2Fn1001&c=gcpvj");
      await f.page.getByRole("alert").waitFor();
      assert.match(await f.page.getByRole("alert").innerText(), /non disponibili/);
      assert.equal(await f.page.locator("h2.scontrino__name").count(), 0);
      assert.equal(
        await f.page.getByRole("button", { name: "Aggiungi prezzo", exact: true }).isDisabled(),
        true,
      );
      assert.deepEqual(f.writes, []);
    } finally {
      await f.close();
    }
  }
});

test("stalled city read has a deadline and does not turn missing data into zero-price success", async () => {
  let release;
  const hold = new Promise((resolve) => {
    release = resolve;
  });
  const f = await fixture({ hold });
  try {
    await f.page.clock.install();
    const started = f.page.waitForRequest("**/api/mobile/prices/cells/gcpvj");
    await f.page.goto(origin + "/mobile/?at=51.5074,-0.1278");
    await started;
    await f.page.clock.fastForward(20001);
    await f.page.getByRole("alert").waitFor();
    assert.match(await f.page.locator(".europe-coverage").innerText(), /Prezzi non disponibili/);
    assert.equal(
      await f.page.getByRole("button", { name: "Aggiungi prezzo", exact: true }).isDisabled(),
      true,
    );
    assert.deepEqual(f.writes, []);
  } finally {
    release();
    await f.close();
  }
});

test("Retry refreshes the catalogue after a deployed version change", async () => {
  const f = await fixture({
    catalog: (read) => ({
      ...catalog,
      version: read === 1 ? catalog.version : "fixture-europe-v2",
    }),
    snapshot: (value) => {
      value.catalog_version = "fixture-europe-v2";
    },
  });
  try {
    await f.page.goto(origin + "/mobile/?path=%2Fbar%2Fn1001&c=gcpvj");
    await f.page.getByRole("alert").waitFor();
    await f.page.getByRole("button", { name: "Riprova", exact: true }).click();
    await f.page.locator("h2.scontrino__name").waitFor();
    await f.page
      .getByRole("combobox", { name: "Scegli cosa bere", exact: true })
      .selectOption("spritz");
    assert.equal(f.reads.filter((v) => v === "/mobile-data/catalog.json").length, 2);
    assert.equal(await f.page.getByRole("alert").count(), 0);
    assert.match(await f.page.locator(".mobile-price--featured").innerText(), /7,50/);
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("Italian legacy-scope lookup has the same bounded deadline and truthful retry", async () => {
  let release;
  const holdVenue = new Promise((resolve) => {
    release = resolve;
  });
  const italian = {
    ...catalog.venues[0],
    key: "n3001",
    name: "Italian fixture",
    lat: 45.4642,
    lon: 9.19,
    cell: "u0nd9",
    city: "Milano",
    country: "IT",
    currency: "EUR",
  };
  const f = await fixture({
    holdVenue,
    catalog: { ...catalog, venues: [...catalog.venues, italian] },
  });
  try {
    await f.page.clock.install();
    const started = f.page.waitForRequest("**/api/mobile/prices/venues/n3001?cell=u0nd9");
    await f.page.goto(origin + "/mobile/?path=%2Fbar%2Fn3001&c=u0nd9");
    await started;
    await f.page.clock.fastForward(20001);
    await f.page.getByRole("button", { name: "Riprova", exact: true }).waitFor();
    assert.match(await f.page.locator(".europe-unavailable").innerText(), /non è disponibile/);
    assert.equal(
      await f.page.locator(".map").count(),
      0,
      "unknown legacy scope must not be treated as a new venue",
    );
    assert.deepEqual(f.writes, []);
  } finally {
    release();
    await f.close();
  }
});

test("price form requires real units, rejects currency symbols and Undo cancels locally at 320 px", async () => {
  const f = await fixture({ viewport: { width: 320, height: 640 } });
  try {
    await openLondon(f);
    await addPrice(f);
    const form = f.page.locator(".europe-price-form");
    await form.getByRole("combobox").selectOption("beer_draft");
    await form.getByRole("textbox", { name: "Importo", exact: true }).fill("€7.50");
    await form.getByRole("button", { name: "Salva prezzo", exact: true }).click();
    assert.match(await form.getByRole("alert").innerText(), /solo il numero[\s\S]*GBP/);
    await form.getByRole("textbox", { name: "Importo", exact: true }).fill("7.50");
    await form.getByRole("button", { name: "Salva prezzo", exact: true }).click();
    assert.match(await form.getByRole("alert").innerText(), /volume reale/);
    await form.getByRole("textbox", { name: "Volume reale (ml)", exact: true }).fill("568");
    await form.getByRole("button", { name: "Salva prezzo", exact: true }).click();
    const undo = f.page.getByRole("button", { name: "Annulla", exact: true });
    await undo.waitFor();
    const box = await undo.boundingBox();
    assert.ok(
      box && box.x >= 0 && box.x + box.width <= 321 && box.y >= 0 && box.y + box.height <= 640,
    );
    await undo.click();
    assert.match(await f.page.locator(".europe-notice").innerText(), /annullato/);
    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= 320), true);
    await f.page.waitForTimeout(5200);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("single-drink report and undo notice omit a redundant serving while measured beer keeps its size", async () => {
  const f = await fixture();
  try {
    await openLondon(f);
    const featured = f.page.locator(".mobile-price--featured");
    await featured.getByRole("button", { name: "Segnala un errore", exact: true }).click();
    const report = f.page.locator(".europe-report");
    await report.waitFor();
    const spritz = await report.innerText();
    assert.match(spritz, /Spritz · 7,50\s£/);
    assert.doesNotMatch(spritz, /Drink singolo/);
    await f.page
      .getByRole("dialog", { name: "Segnala un problema" })
      .getByRole("button", { name: "Chiudi" })
      .click();

    await f.page.getByRole("combobox", { name: "Scegli cosa bere" }).selectOption("beer_draft");
    await featured.getByRole("button", { name: "Segnala un errore", exact: true }).click();
    assert.match(await report.innerText(), /Birra media · \d+ ml · [\d,]+\s£/);
    await f.page
      .getByRole("dialog", { name: "Segnala un problema" })
      .getByRole("button", { name: "Chiudi" })
      .click();

    await f.page.clock.install();
    await addPrice(f);
    const form = f.page.locator(".europe-price-form");
    await form.getByRole("combobox").selectOption("spritz");
    await form.getByRole("textbox", { name: "Importo", exact: true }).fill("8,25");
    await form.getByRole("button", { name: "Salva prezzo", exact: true }).click();
    const notice = f.page.locator(".europe-notice");
    await notice.waitFor();
    assert.match(await notice.innerText(), /8,25\s£/);
    assert.doesNotMatch(await notice.innerText(), /Drink singolo/);
    await notice.getByRole("button", { name: "Annulla", exact: true }).click();
    await f.page.clock.fastForward(6000);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("customer price submission uses protected session and exact original target without source claims", async () => {
  const f = await fixture({ first401: true });
  try {
    await openLondon(f);
    await addPrice(f);
    const form = f.page.locator(".europe-price-form");
    await form.getByRole("textbox", { name: "Importo", exact: true }).fill("8,25");
    await form.getByRole("button", { name: "Salva prezzo", exact: true }).click();
    await f.page.mouse.move(0, 0);
    await f.page.waitForFunction(
      () => document.querySelector(".europe-notice")?.textContent.includes("prezzo salvato"),
      undefined,
      { timeout: 15000 },
    );
    const contributions = f.writes.filter((v) => v.path === "/api/mobile/prices");
    assert.equal(contributions.length, 2, "one 401 then normal session-backed retry");
    assert.deepEqual(contributions[0].body, {
      venue: "n1001",
      cell: "gcpvj",
      currency: "GBP",
      items: [{ drink: "spritz", hh: 0, serving: { unit: "drink" }, amount_minor: 825 }],
    });
    assert.deepEqual(contributions[1].body, contributions[0].body);
    assert.deepEqual(
      f.writes.filter((v) => v.path === "/api/session"),
      [{ path: "/api/session", body: { token: "fixture-only-token" } }],
    );
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("confirmation targets the viewed revision and a conflict never increments local counts", async () => {
  const f = await fixture({ confirmConflict: true });
  try {
    await openLondon(f);
    const featured = f.page.locator(".mobile-price--featured");
    const beforeText = await featured.locator(".price__meta").innerText();
    await featured.getByRole("button", { name: "Confermo", exact: true }).click();
    await f.page.waitForFunction(() =>
      document.querySelector(".europe-notice")?.textContent.includes("cambiato"),
    );
    assert.equal(await featured.locator(".price__meta").innerText(), beforeText);
    assert.deepEqual(f.writes[0], {
      path: "/api/mobile/prices/confirm",
      body: {
        venue: "n1001",
        cell: "gcpvj",
        currency: "GBP",
        drink: "spritz",
        hh: 0,
        serving: { unit: "drink" },
        revision: rows[0].revision,
      },
    });
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("queued contribution keeps its London target and reachable Undo after switching to euros", async () => {
  const f = await fixture();
  try {
    await openLondon(f);
    await addPrice(f);
    const form = f.page.locator(".europe-price-form");
    await form.getByRole("textbox", { name: "Importo", exact: true }).fill("8,25");
    await form.getByRole("button", { name: "Salva prezzo", exact: true }).click();
    // Closing the venue then changing city is a real supported interaction during the undo window.
    await f.page.getByRole("dialog").getByRole("button", { name: "Chiudi", exact: true }).click();
    await changeCity(f.page, "Paris");
    const undo = f.page.getByRole("button", { name: "Annulla", exact: true });
    assert.equal(await undo.isVisible(), true);
    assert.match(await f.page.locator(".europe-notice").innerText(), /Fixture <pub>.*8,25.*£/);
    await f.page.mouse.move(0, 0);
    await f.page.waitForFunction(
      () => document.querySelector(".europe-notice")?.textContent.includes("prezzo salvato"),
      undefined,
      { timeout: 15000 },
    );
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].body.venue, "n1001");
    assert.equal(f.writes[0].body.currency, "GBP");
    assert.match(await f.page.locator(".europe-search-row").innerText(), /Paris[\s\S]*EUR/);
    await f.page.getByRole("button", { name: "Elenco locali", exact: true }).click();
    assert.match(
      await f.page
        .getByRole("dialog")
        .getByRole("button", { name: /^Paris fixture/ })
        .innerText(),
      /9,00\s*€/,
    );
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("legacy Italian search opens real app catalogue coordinates without synthetic place IDs", async () => {
  const f = await fixture();
  try {
    await f.page.goto(origin + "/mobile/");
    await f.page.getByRole("button", { name: "Cerca città o bar", exact: true }).click();
    const input = f.page.getByRole("combobox");
    await input.fill("London");
    await input.press("ArrowDown");
    await input.press("Enter");
    await f.page.locator(".europe-app .europe-search").waitFor();
    const mapSearch = f.page.locator('.europe-app button[data-dovebevo-search="1"]');
    assert.equal(await mapSearch.count(), 1, "The European map has one city search action");
    assert.equal(await mapSearch.isVisible(), true, "The map search is visible");
    assert.equal(await f.page.locator(".europe-city-current").isVisible(), true);
    await mapSearch.click();
    await f.page
      .getByRole("dialog")
      .getByRole("textbox", { name: "Cerca una città o un bar" })
      .waitFor();
    const url = new URL(f.page.url());
    assert.equal(url.pathname, "/mobile/");
    assert.equal(url.searchParams.get("at"), "51.50790,-0.12780");
    assert.equal(url.searchParams.has("place"), false);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("European map coverage remains one line at phone widths", async () => {
  const f = await fixture();
  try {
    await openLondon(f, false);
    for (const width of [320, 390]) {
      await f.page.setViewportSize({ width, height: 700 });
      const coverage = f.page.locator(".europe-coverage");
      assert.equal(
        await coverage.evaluate((element) => getComputedStyle(element).whiteSpace),
        "nowrap",
      );
      assert.ok((await coverage.boundingBox()).height <= 48);
      const search = await f.page.locator(".europe-search").boundingBox();
      const home = await f.page.locator(".europe-home").boundingBox();
      const locate = await f.page.locator(".europe-locate").boundingBox();
      const add = await f.page.locator(".europe-map-add").boundingBox();
      const summary = await coverage.boundingBox();
      assert.ok(search && home && locate && add && summary);
      assert.ok(search.x + search.width + 8 <= home.x, `Search clears Home at ${width}px`);
      assert.ok(home.x + home.width + 8 <= locate.x, `Home clears Locate at ${width}px`);
      assert.ok(locate.x + locate.width + 8 <= add.x, `Locate clears Add at ${width}px`);
      assert.ok(Math.abs(search.y - locate.y) <= 2 && Math.abs(locate.y - add.y) <= 2);
      assert.ok(
        summary.y + summary.height + 8 <= search.y,
        `Coverage clears map controls at ${width}px`,
      );
      if (width === 320)
        await f.page.screenshot({ path: path.join(output, "europe-coverage-320-fixture.png") });
    }
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("European map Home returns to the current city after zoom and a city switch", async () => {
  const f = await fixture();
  try {
    await openLondon(f, false);
    const map = f.page.locator(".europe-map");
    const home = f.page.getByRole("button", { name: "Vista iniziale della città" });
    await f.page.waitForFunction(
      () => document.querySelector(".europe-map")?.getAttribute("data-ready") === "true",
    );
    const box = await map.boundingBox();
    assert.ok(box);
    await f.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await f.page.mouse.wheel(0, 650);
    await f.page.waitForFunction(
      () => Number(document.querySelector(".europe-map")?.getAttribute("data-zoom")) < 14,
    );
    await home.click();
    await f.page.waitForFunction(() => {
      const element = document.querySelector(".europe-map");
      const [lat, lon] = (element?.getAttribute("data-center") ?? "").split(",").map(Number);
      return (
        Math.abs(lat - 51.5079) < 0.0001 &&
        Math.abs(lon + 0.1278) < 0.0001 &&
        Math.abs(Number(element?.getAttribute("data-zoom")) - 14) < 0.1
      );
    });
    assert.equal(await map.getAttribute("data-zoom"), "14.0");
    await changeCity(f.page, "Paris");
    await f.page.waitForFunction(() => {
      const [lat, lon] = (document.querySelector(".europe-map")?.getAttribute("data-center") ?? "")
        .split(",")
        .map(Number);
      return Math.abs(lat - 48.8566) < 0.0001 && Math.abs(lon - 2.3522) < 0.0001;
    });
    await f.page.getByRole("button", { name: "Elenco locali", exact: true }).click();
    await f.page
      .getByRole("dialog")
      .getByRole("button", { name: /^Paris fixture bar/ })
      .click();
    await f.page.locator("h2.scontrino__name").waitFor();
    await f.page.getByRole("dialog").getByRole("button", { name: "Chiudi" }).click();
    await f.page.locator("h2.scontrino__name").waitFor({ state: "hidden" });
    await f.page.waitForFunction(
      () => document.querySelector(".europe-map")?.getAttribute("data-selected") === "",
    );
    await f.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await f.page.mouse.wheel(0, 650);
    await f.page.waitForFunction(
      () => Number(document.querySelector(".europe-map")?.getAttribute("data-zoom")) < 14,
    );
    await home.click();
    await f.page.waitForFunction(() => {
      const element = document.querySelector(".europe-map");
      const [lat, lon] = (element?.getAttribute("data-center") ?? "").split(",").map(Number);
      return (
        Math.abs(lat - 48.8566) < 0.0001 &&
        Math.abs(lon - 2.3522) < 0.0001 &&
        Math.abs(Number(element?.getAttribute("data-zoom")) - 14) < 0.1
      );
    });
    assert.equal(await map.getAttribute("data-zoom"), "14.0");
    assert.equal(
      await f.page.getByRole("combobox", { name: "Scegli cosa bere", exact: true }).inputValue(),
      "spritz",
    );
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("Cerca closes a London venue to the same city map before opening the picker", async () => {
  const f = await fixture();
  try {
    await openLondon(f);
    const historyLength = await f.page.evaluate(() => history.length);
    const map = f.page.locator(".map");
    await f.page.waitForFunction(() =>
      Boolean(document.querySelector(".map")?.getAttribute("data-center")),
    );
    const afterClick = await f.page.evaluate(() => {
      document.querySelector('.europe-app button[data-dovebevo-search="1"]').click();
      return location.href;
    });
    const route = new URL(afterClick);
    assert.equal(route.pathname, "/mobile/");
    assert.equal(route.searchParams.get("at"), "51.50790,-0.12780");
    assert.equal(route.searchParams.has("path"), false);
    assert.equal(await f.page.evaluate(() => history.length), historyLength);
    const picker = f.page.getByRole("dialog");
    await picker.getByRole("textbox", { name: "Cerca una città o un bar" }).waitFor();
    assert.equal(await map.getAttribute("data-selected"), "");
    await picker.getByRole("button", { name: "Chiudi", exact: true }).click();
    await picker.waitFor({ state: "hidden" });
    assert.equal(await map.getAttribute("data-center"), "51.50790,-0.12780");
    assert.equal(await map.count(), 1);
    await f.page.getByRole("button", { name: "Elenco locali", exact: true }).click();
    await f.page
      .getByRole("dialog")
      .getByRole("button", { name: /^Fixture/ })
      .click();
    await f.page.locator("h2.scontrino__name").waitFor();
    assert.equal(new URL(f.page.url()).searchParams.get("path"), "/bar/n1001");
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("European venue and city search privacy links use the approved app policy", async () => {
  const f = await fixture();
  try {
    await openLondon(f);
    async function checkLinks() {
      const links = f.page.getByRole("navigation", { name: "Informazioni", exact: true });
      await links.waitFor();
      assert.equal(
        await links.getByRole("link", { name: "Privacy", exact: true }).getAttribute("href"),
        "https://github.com/robertovalerirv-beep/dove-bevo/blob/main/mobile-apps/privacy.md",
      );
      assert.equal(
        await links.getByRole("link", { name: "Regole", exact: true }).getAttribute("href"),
        "/regole",
      );
    }
    await checkLinks();
    await f.page.getByRole("dialog").getByRole("button", { name: "Chiudi", exact: true }).click();
    await f.page.locator('.europe-app button[data-dovebevo-search="1"]').click();
    await checkLinks();
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("European price actions and selected drink dropdown remain readable on small phones", async () => {
  let release;
  const holdConfirm = new Promise((resolve) => {
    release = resolve;
  });
  const f = await fixture({ holdConfirm });
  try {
    await openLondon(f, false);
    const drinkSelect = f.page.getByRole("combobox", { name: "Scegli cosa bere", exact: true });
    assert.equal(await drinkSelect.inputValue(), "spritz");
    assert.equal(await drinkSelect.locator("option").count(), 9);
    for (const code of ["spritz", "beer_draft"]) {
      await drinkSelect.selectOption(code);
      await drinkSelect.focus();
      const colors = await drinkSelect.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          text: style.color,
          outline: style.outlineColor,
          outlineStyle: style.outlineStyle,
        };
      });
      assert.ok(contrastRatio(colors.text, colors.background) >= 4.5, JSON.stringify(colors));
      assert.equal(colors.outlineStyle, "solid");
      assert.ok(contrastRatio(colors.outline, colors.background) >= 4.5, JSON.stringify(colors));
      assert.ok(contrastRatio(colors.outline, "rgb(255, 244, 228)") >= 4.5, JSON.stringify(colors));
    }
    await openLondon(f);
    const buttons = f.page.locator(".mobile-price--featured .price__actions .btn");
    const row = async () => {
      const boxes = await buttons.evaluateAll((items) =>
        items.map((button) => {
          const r = button.getBoundingClientRect();
          return {
            y: r.y,
            width: r.width,
            height: r.height,
            scroll: button.scrollWidth,
            client: button.clientWidth,
          };
        }),
      );
      assert.equal(boxes.length, 3);
      assert.ok(
        boxes.every(
          (b) =>
            Math.abs(b.y - boxes[0].y) < 1 &&
            b.height >= 48 &&
            b.width >= 48 &&
            b.scroll <= b.client + 1,
        ),
        JSON.stringify(boxes),
      );
    };
    for (const width of [393, 320]) {
      await f.page.setViewportSize({ width, height: 700 });
      await row();
    }
    const request = f.page.waitForRequest("**/api/mobile/prices/confirm");
    await buttons.first().click();
    await request;
    assert.deepEqual(await buttons.evaluateAll((items) => items.map((button) => button.disabled)), [
      true,
      true,
      true,
    ]);
    await row();
    release();
    await buttons.first().waitFor({ state: "visible" });
    await f.page.waitForFunction(
      () => !document.querySelector(".mobile-price--featured .price__actions button")?.disabled,
    );
    await row();
    await f.page.screenshot({ path: path.join(output, "orange-europe-venue-fixture.png") });
    await f.page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    const large = await buttons.evaluateAll((items) =>
      items.map((button) => {
        const r = button.getBoundingClientRect();
        return {
          y: r.y,
          height: r.height,
          font: Number.parseFloat(getComputedStyle(button).fontSize),
          scroll: button.scrollWidth,
          client: button.clientWidth,
        };
      }),
    );
    assert.ok(
      large.every((b) => b.height >= 48 && b.font >= 26 && b.scroll <= b.client + 1),
      JSON.stringify(large),
    );
    assert.ok(large[2].y > large[0].y);
    await buttons.last().scrollIntoViewIfNeeded();
    assert.ok(await buttons.last().isVisible());
    assert.deepEqual(f.errors, []);
    assert.equal(f.writes.length, 1, "Only the intercepted owned confirmation was submitted");
  } finally {
    release();
    await f.close();
  }
});

test("European drink rows expose exact native saves only after the native bridge advertises support", async () => {
  const f = await fixture();
  try {
    await openLondon(f);
    assert.equal(await f.page.locator(".europe-price__save").count(), 0);
    await f.page.evaluate(() => {
      window.DoveBevoNativeEuropeSave = true;
      window.dispatchEvent(new Event("dovebevo-native-ready"));
    });
    const beer400 = f.page.locator(".europe-venue .mobile-price").filter({
      has: f.page.locator(".price__name", { hasText: "400 ml" }),
    });
    const beer568 = f.page.locator(".europe-venue .mobile-price").filter({
      has: f.page.locator(".price__name", { hasText: "568 ml" }),
    });
    const first = new URL(
      await beer400.locator(".europe-price__save").getAttribute("href"),
      origin,
    );
    const second = new URL(
      await beer568.locator(".europe-price__save").getAttribute("href"),
      origin,
    );
    assert.equal(first.pathname, "/mobile/");
    assert.deepEqual(
      [...first.searchParams],
      [
        ["path", "/bar/n1001"],
        ["c", "gcpvj"],
        ["save_europe", "beer_draft"],
        ["band", "normal"],
        ["currency", "GBP"],
        ["serving", "ml:400"],
      ],
    );
    assert.equal(second.searchParams.get("serving"), "ml:568");
    assert.equal(await f.page.locator(".europe-price__save").count(), 3);
    for (const width of [390, 320]) {
      await f.page.setViewportSize({ width, height: 700 });
      const geometry = await beer400
        .locator(".europe-price__quick-actions > a, .europe-price__quick-actions > button")
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const box = node.getBoundingClientRect();
            return { left: box.left, right: box.right, height: box.height };
          }),
        );
      assert.equal(geometry.length, 2);
      assert.ok(
        geometry.every((box) => box.left >= 0 && box.right <= width + 1 && box.height >= 44),
        JSON.stringify(geometry),
      );
    }
    await f.page.screenshot({ path: path.join(output, "europe-exact-drink-actions-320.png") });
    await f.page.evaluate(() => {
      window.DoveBevoNativeSavedDrinkKeys = ["n1001|gcpvj|europe|beer_draft|0|GBP|ml:568"];
      window.dispatchEvent(new Event("dovebevo-native-favourites-changed"));
    });
    await beer568.locator('.europe-price__save[data-saved="true"]').waitFor();
    assert.equal(await beer568.locator(".europe-price__save").getAttribute("href"), null);
    assert.equal(await beer400.locator(".europe-price__save").getAttribute("data-saved"), "false");
    await f.page.evaluate(() => {
      window.DoveBevoNativeSavedDrinkKeys = [];
      window.dispatchEvent(new Event("dovebevo-native-favourites-changed"));
    });
    await beer568.locator('.europe-price__save[data-saved="false"]').waitFor();
    assert.deepEqual(f.writes, [], "A private Save link does not post a public contribution");
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("European thumbs are adjacent and vote only the original serving and GBP price identity", async () => {
  const f = await fixture();
  try {
    await openLondon(f);
    await f.page.waitForFunction(() =>
      [...document.querySelectorAll(".europe-drink-vote")].every((button) => !button.disabled),
    );
    assert.ok(f.voteReads.every((url) => new URL(url).searchParams.get("include_europe") === "1"));
    const beer400 = f.page.locator(".europe-venue .mobile-price").filter({
      has: f.page.locator(".price__name", { hasText: "400 ml" }),
    });
    const beer568 = f.page.locator(".europe-venue .mobile-price").filter({
      has: f.page.locator(".price__name", { hasText: "568 ml" }),
    });
    const first = beer400.locator(".europe-drink-vote");
    const second = beer568.locator(".europe-drink-vote");
    assert.match(await first.innerText(), /0/);
    await first.click();
    await f.page.waitForFunction(() =>
      document.querySelector('.europe-drink-vote[aria-pressed="true"]')?.textContent.includes("1"),
    );
    assert.equal(await first.getAttribute("aria-pressed"), "true");
    assert.match(await second.innerText(), /0/, "A different beer serving keeps its own count");
    assert.deepEqual(f.writes[0], {
      path: "/api/mobile/v2/drink-votes/venues/n1001",
      body: {
        target: {
          kind: "europe",
          drink: "beer_draft",
          band: "normal",
          currency: "GBP",
          serving: { unit: "ml", ml: 400 },
        },
        recommended: true,
      },
    });
    await first.click();
    await f.page.waitForFunction(() => {
      const row = [...document.querySelectorAll(".europe-venue .mobile-price")].find((element) =>
        element.querySelector(".price__name")?.textContent.includes("400 ml"),
      );
      const button = row?.querySelector(".europe-drink-vote");
      return button?.getAttribute("aria-pressed") === "false" && button.textContent.includes("0");
    });
    assert.equal(await first.getAttribute("aria-pressed"), "false");
    assert.equal(f.writes[1].body.recommended, false);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("European vote read and failed write expose retry instead of claiming success", async () => {
  const f = await fixture({ voteFailReadOnce: true, voteFailPostOnce: true });
  try {
    await openLondon(f);
    await f.page.getByRole("alert").getByRole("button", { name: "Riprova" }).click();
    const first = f.page.locator(".europe-venue .mobile-price--featured .europe-drink-vote");
    await f.page.waitForFunction(
      () =>
        !document.querySelector(".europe-venue .mobile-price--featured .europe-drink-vote")
          ?.disabled,
    );
    await first.click();
    await f.page.getByText("Consiglio non salvato. Riprova.").waitFor();
    assert.equal(await first.getAttribute("aria-pressed"), "false");
    assert.match(await first.innerText(), /0/);
    await first.click();
    await f.page.waitForFunction(() =>
      document
        .querySelector(
          '.europe-venue .mobile-price--featured .europe-drink-vote[aria-pressed="true"]',
        )
        ?.textContent.includes("1"),
    );
    assert.equal(await f.page.getByText("Consiglio non salvato. Riprova.").count(), 0);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("European vote reconciles a committed write after its response is lost", async () => {
  const f = await fixture({ voteCommitThenFailOnce: true });
  try {
    await openLondon(f);
    const first = f.page.locator(".europe-venue .mobile-price--featured .europe-drink-vote");
    await f.page.waitForFunction(
      () =>
        !document.querySelector(".europe-venue .mobile-price--featured .europe-drink-vote")
          ?.disabled,
    );
    await first.click();
    await f.page.waitForFunction(() =>
      document
        .querySelector(
          '.europe-venue .mobile-price--featured .europe-drink-vote[aria-pressed="true"]',
        )
        ?.textContent.includes("1"),
    );
    assert.equal(await f.page.locator(".europe-vote-failed").count(), 0);
    assert.ok(
      f.voteReads.length >= 2,
      "The client reconciles the ambiguous write with a second read",
    );
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});
