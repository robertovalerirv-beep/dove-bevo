import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import path from "node:path";
import { build } from "esbuild";

// Exercise the real app-only map functions without fetching or posting public data.
// Only the website imports are replaced; bestPrice is its production implementation.
const root = fileURLToPath(new URL("../../..", import.meta.url));
const compiled = await build({
  entryPoints: [path.join(root, "mobile-apps/web/menu-v2.ts")],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "website-read-stubs",
      setup(plugin) {
        plugin.onResolve({ filter: /^@site\/app\/lib\/data$/ }, () => ({
          path: "data",
          namespace: "website-read-stubs",
        }));
        plugin.onResolve({ filter: /^@site\/app\/i18n\/lang$/ }, () => ({
          path: "lang",
          namespace: "website-read-stubs",
        }));
        plugin.onLoad({ filter: /.*/, namespace: "website-read-stubs" }, (args) => ({
          contents:
            args.path === "data"
              ? 'export { bestPrice } from "./src/shared/prices.ts"; export async function loadCell() { return globalThis.__doveLegacyCell ?? []; }'
              : 'export function currentLang() { return "it"; }',
          loader: "ts",
          resolveDir: root,
        }));
      },
    },
  ],
});
const {
  isMediumDraftBeerServing,
  mobileMenuPin,
  mobileMinimumPin,
  mobileCoverage,
  loadMobileCell,
} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`
);

function offer(
  ml,
  label,
  amount = 500,
  category = "beer_draft",
  kind = "regular",
  currency = "EUR",
) {
  return {
    category,
    serving: { ml, label },
    amount_minor: amount,
    currency,
    currency_exponent: 2,
    context: { kind },
  };
}

function venue(samples, prices = []) {
  return {
    key: "n123",
    name: "Fixture bar",
    kind: 1,
    lat: 45.46,
    lon: 9.19,
    addr: "",
    city: "Milano",
    cell: "u0nd9",
    prices,
    pending: false,
    verified: false,
    mobileMenuSamples: samples,
  };
}

test("250 ml or unknown draft beer never becomes a medium map price or coverage", () => {
  for (const serving of [
    { ml: 250, label: "Piccola" },
    { ml: 500, label: "Piccola" },
    { ml: 500, label: "Grande 50 cl" },
    { ml: 500, label: "Large 500 ml" },
    { ml: 568, label: "Pint" },
    { ml: 330, label: null },
    { ml: null, label: null },
    { ml: null, label: "Birra alla spina" },
    { ml: null, label: "Media / Piccola" },
    { ml: null, label: "Media / Grande" },
    { ml: null, label: "Medium / Large" },
    { ml: null, label: "Media 25 cl" },
    { ml: null, label: "25 cl" },
    { ml: null, label: "70 cl" },
    { ml: null, label: "Grande 50 cl" },
    { ml: null, label: "50 cl / 25 cl" },
    { ml: null, label: "multimedia" },
  ]) {
    assert.equal(isMediumDraftBeerServing(serving), false, JSON.stringify(serving));
    const row = venue([offer(serving.ml, serving.label, 400)]);
    assert.equal(mobileMenuPin(row, ["beer_draft"]), null, JSON.stringify(serving));
    assert.deepEqual(mobileCoverage([row], ["beer_draft"]), { withPrice: 0, total: 1 });
  }
});

test("conditional minimum spend remains separate from the drink price on map pins", () => {
  const row = venue([offer(500, "Media", 450)]);
  row.mobileMinimumSpends = [
    {
      id: "minimum-1",
      label: "Consumazione minima",
      amount_minor: 1500,
      currency: "EUR",
      currency_exponent: 2,
      basis: "person",
      applicability: "conditional",
      condition: "durante le partite in diretta",
    },
  ];
  assert.match(mobileMenuPin(row, ["beer_draft"]), /4,50.*€ MENU/);
  assert.match(mobileMinimumPin(row), /15,00.*€ \/ persona/);
  assert.match(mobileMinimumPin(venue([offer(500, "Media", 450)])), /Condizioni.*verificare/);
  const checkedWithoutMinimum = venue([offer(500, "Media", 450)]);
  checkedWithoutMinimum.mobileMinimumSpends = [];
  assert.equal(mobileMinimumPin(checkedWithoutMinimum), null);
});

test("a legacy price stays qualified until unfiltered venue conditions arrive", async () => {
  const cell = "u0ndb";
  const legacy = { ...venue([], [["n123", "spritz", 0, 550, "2026-11-20", 0, 0]]), cell };
  const minimum = {
    id: "minimum-1",
    label: "Consumazione minima",
    amount_minor: 1500,
    currency: "EUR",
    currency_exponent: 2,
    basis: "person",
    applicability: "conditional",
    condition: "durante le partite in diretta",
    source: {
      id: "source-1",
      url: "https://menu.example/conditions",
      text_sha256: "a".repeat(64),
      checked_on: "2026-11-20",
    },
  };
  const owner = {
    key: "n123",
    cell,
    name: "Fixture bar",
    kind: 1,
    lat: 45.46,
    lon: 9.19,
    address: null,
    city: "Milano",
    country: "IT",
    identity_url: "https://www.openstreetmap.org/node/123",
    identity_kind: "osm",
    matching_offer_count: 1,
    sample_offers: [],
    fee_coverage: { status: "unknown", source: null },
    minimum_spends: [minimum],
  };
  const page = (categories, venues) => ({
    schema_version: 2,
    coverage: { complete: false, basis: "verified_source_items_only" },
    price_scope: "menu_item_only",
    cell,
    category: categories?.[0] ?? null,
    categories,
    venues,
    next_after: null,
    unresolved_venues: 0,
  });
  let releaseIdentity;
  const identity = new Promise((resolve) => {
    releaseIdentity = resolve;
  });
  const previousFetch = globalThis.fetch;
  globalThis.__doveLegacyCell = [legacy];
  globalThis.fetch = async (input) => {
    const url = new URL(input, "https://www.dovebevo.com");
    if (url.searchParams.has("categories"))
      return new globalThis.Response(JSON.stringify(page(["spritz"], [])), {
        headers: { "content-type": "application/json" },
      });
    await identity;
    return new globalThis.Response(JSON.stringify(page(null, [owner])), {
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const first = await loadMobileCell(cell, ["spritz"]);
    assert.match(mobileMinimumPin(first[0]), /Condizioni.*verificare/);
    releaseIdentity();
    let resolved;
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
      resolved = (await loadMobileCell(cell, ["spritz"]))[0];
      if (mobileMinimumPin(resolved)?.includes("15,00")) break;
    }
    assert.equal(resolved.prices[0][3], 550, "the customer drink amount stays unchanged");
    assert.match(mobileMinimumPin(resolved), /15,00.*€ \/ persona/);
  } finally {
    globalThis.fetch = previousFetch;
    delete globalThis.__doveLegacyCell;
    releaseIdentity();
  }
});

test("a failed menu read leaves a customer price visibly unverified", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.__doveLegacyCell = [
    { ...venue([], [["n123", "negroni", 0, 900, "2026-11-20", 0, 0]]), cell: "u0ndc" },
  ];
  globalThis.fetch = async () => new globalThis.Response("unavailable", { status: 503 });
  try {
    const [row] = await loadMobileCell("u0ndc", ["negroni"]);
    assert.equal(row.prices[0][3], 900);
    assert.match(mobileMinimumPin(row), /Condizioni.*verificare/);
  } finally {
    globalThis.fetch = previousFetch;
    delete globalThis.__doveLegacyCell;
  }
});

test("a menu identity mismatch never qualifies another venue's customer price", async () => {
  const previousFetch = globalThis.fetch;
  const minimum = {
    id: "minimum-1",
    label: "Consumazione minima",
    amount_minor: 1500,
    currency: "EUR",
    currency_exponent: 2,
    basis: "person",
    applicability: "all_orders",
    condition: null,
    source: {
      id: "source-1",
      url: "https://menu.example/conditions",
      text_sha256: "a".repeat(64),
      checked_on: "2026-11-20",
    },
  };
  try {
    for (const [cell, mismatch] of [
      ["u0ndf", { name: "Another bar" }],
      ["u0ndg", { lat: 45.461 }],
      ["u0ndh", { lon: 9.191 }],
      ["u0ndj", { cell: "u0ndb" }],
    ]) {
      const legacy = {
        ...venue([], [["n123", "spritz", 0, 550, "2026-11-20", 0, 0]]),
        cell,
        ...mismatch,
      };
      const owner = {
        key: "n123",
        cell,
        name: "Fixture bar",
        kind: 1,
        lat: 45.46,
        lon: 9.19,
        address: null,
        city: "Milano",
        country: "IT",
        identity_url: "https://www.openstreetmap.org/node/123",
        identity_kind: "osm",
        matching_offer_count: 1,
        sample_offers: [],
        fee_coverage: { status: "unknown", source: null },
        minimum_spends: [minimum],
      };
      globalThis.__doveLegacyCell = [legacy];
      globalThis.fetch = async () =>
        new globalThis.Response(
          JSON.stringify({
            schema_version: 2,
            coverage: { complete: false, basis: "verified_source_items_only" },
            price_scope: "menu_item_only",
            cell,
            category: null,
            categories: null,
            venues: [owner],
            next_after: null,
            unresolved_venues: 0,
          }),
          { headers: { "content-type": "application/json" } },
        );
      await loadMobileCell(cell, []);
      let resolved;
      for (let attempt = 0; attempt < 15; attempt++) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
        resolved = (await loadMobileCell(cell, []))[0];
      }
      assert.equal(resolved.prices[0][3], 550);
      assert.match(mobileMinimumPin(resolved), /Condizioni.*verificare/);
      assert.equal(resolved.mobileMenuCount, undefined);
    }
  } finally {
    globalThis.fetch = previousFetch;
    delete globalThis.__doveLegacyCell;
  }
});

test("400–600 ml and explicit medium labels show their sourced menu amount", () => {
  for (const serving of [
    { ml: 400, label: "40 cl" },
    { ml: 400, label: "MEDIA (0.40LT)" },
    { ml: 500, label: "50 cl" },
    { ml: 500, label: "Media 0.50LT" },
    { ml: 600, label: "60 cl" },
    { ml: null, label: "Media" },
    { ml: null, label: "medium" },
    { ml: null, label: "Media 0,5 l" },
    { ml: null, label: "40 cl" },
    { ml: null, label: "50 cl" },
    { ml: null, label: "0,5 l" },
    { ml: null, label: "500 ml" },
    { ml: null, label: "60 cl" },
  ]) {
    assert.equal(isMediumDraftBeerServing(serving), true, JSON.stringify(serving));
    const row = venue([offer(serving.ml, serving.label, 550)]);
    assert.match(mobileMenuPin(row, ["beer_draft"]), /5,50.*€ MENU/);
    assert.deepEqual(mobileCoverage([row], ["beer_draft"]), { withPrice: 1, total: 1 });
  }
  for (const ml of [399, 601]) assert.equal(isMediumDraftBeerServing({ ml, label: null }), false);
});

test("conflicting cl or LT label rejects a 500 ml field and its map coverage", () => {
  for (const label of [
    "Media 25 cl",
    "Media 70 cl",
    "Media 40 cl",
    "Media 0.25LT",
    "Media 0.70LT",
  ]) {
    const serving = { ml: 500, label };
    assert.equal(isMediumDraftBeerServing(serving), false, label);
    const row = venue([offer(serving.ml, serving.label, 400)]);
    assert.equal(mobileMenuPin(row, ["beer_draft"]), null, label);
    assert.deepEqual(mobileCoverage([row], ["beer_draft"]), { withPrice: 0, total: 1 });
  }
  assert.equal(isMediumDraftBeerServing({ ml: 500, label: "Media 50 cl" }), true);
});

test("a smaller first sample cannot mask a later medium beer; non-beer categories stay intact", () => {
  const small = offer(250, "Piccola", 400);
  const medium = offer(500, "Media", 650);
  const spritz = offer(null, null, 750, "spritz");
  const row = venue([small, medium, spritz]);
  assert.match(mobileMenuPin(row, ["beer_draft"]), /6,50.*€ MENU/);
  assert.match(mobileMenuPin(row, ["spritz"]), /7,50.*€ MENU/);
  assert.equal(mobileMenuPin(venue([small, spritz]), ["beer_draft"]), null);
  assert.equal(
    mobileMenuPin(venue([offer(500, "Media", 350, "beer_draft", "happy_hour")]), ["beer_draft"]),
    null,
  );
  assert.deepEqual(mobileCoverage([venue([small]), row], ["beer_draft"]), {
    withPrice: 1,
    total: 2,
  });
  const sterling = venue([offer(500, "Media", 575, "beer_draft", "regular", "GBP")]);
  assert.match(mobileMenuPin(sterling, ["beer_draft"]), /5,75.*£ MENU/);
});

test("one venue with a reported medium price and a menu offer counts once", () => {
  const reported = ["n123", "beer_draft", 0, 550, "2026-11-10", 0, 0];
  const row = venue([offer(500, "Media", 600)], [reported]);
  assert.deepEqual(mobileCoverage([row], ["beer_draft"]), { withPrice: 1, total: 1 });
});
