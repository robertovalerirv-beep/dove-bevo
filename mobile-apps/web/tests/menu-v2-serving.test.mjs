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
              ? 'export { bestPrice } from "./src/shared/prices.ts"; export async function loadCell() { return []; }'
              : 'export function currentLang() { return "it"; }',
          loader: "ts",
          resolveDir: root,
        }));
      },
    },
  ],
});
const { isMediumDraftBeerServing, mobileMenuPin, mobileMinimumPin, mobileCoverage } = await import(
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
  assert.equal(mobileMinimumPin(venue([offer(500, "Media", 450)])), null);
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
