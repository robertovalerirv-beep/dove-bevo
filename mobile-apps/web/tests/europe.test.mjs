import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath, URL, URLSearchParams } from "node:url";
import path from "node:path";
import { before, after, test } from "node:test";
import { chromium } from "@playwright/test";
import { pageCsp } from "../../../src/worker/lib/security-headers.ts";
/* global document, structuredClone */

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
    reads = [];
  let catalogReads = 0;
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
      if (url.pathname === "/api/session") return route.fulfill({ json: { ok: true } });
      if (options.first401 && writes.filter((v) => v.path === url.pathname).length === 1)
        return route.fulfill({ status: 401, json: { error: "session" } });
      if (url.pathname === "/api/mobile/prices/confirm")
        return route.fulfill({
          status: options.confirmConflict ? 409 : 200,
          json: options.confirmConflict
            ? { error: "conflict" }
            : { status: "confirmed", confirmations: 3 },
        });
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
  return { page, writes, errors, external, reads, close: () => context.close() };
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
}
async function changeCity(page, name) {
  await page.getByRole("button", { name: "Cambia città", exact: true }).click();
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

test("beer formats and quarantined prices are never merged into one cheap price", async () => {
  const f = await fixture();
  try {
    await openLondon(f, false);
    await f.page.getByRole("radio", { name: "Birra media", exact: true }).click();
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
    await f.page.getByRole("button", { name: "Cambia citt\u00e0", exact: true }).click();
    await checkLinks();
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});
