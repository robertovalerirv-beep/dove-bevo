import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { runInNewContext } from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const script = readFileSync(resolve(here, "..", "VenueCapture.js"), "utf8");
const europe = readFileSync(resolve(here, "..", "..", "web/europe/EuropeApp.tsx"), "utf8");

function capture({ key, href, legacyDrink = null, europeDrink = null, happyHour = false }) {
  const heading = { textContent: "Test Bar", getClientRects: () => [{}] };
  const dialog = {
    matches: () => true,
    getAttribute: () => "Test Bar",
    querySelector: () => heading,
  };
  const menu = legacyDrink
    ? {
        querySelectorAll: () => [
          { closest: () => ({ querySelector: () => ({ textContent: legacyDrink }) }) },
        ],
      }
    : null;
  const selected = europeDrink
    ? {
        value: europeDrink.code,
        selectedOptions: [{ value: europeDrink.code, textContent: europeDrink.name }],
        getClientRects: () => [{}],
      }
    : null;
  return runInNewContext(script, {
    URL,
    location: { href },
    document: {
      querySelector: () => menu,
      querySelectorAll(selector) {
        if (selector === "section.map[data-selected]") return [{ getAttribute: () => key }];
        if (selector === "dialog.sheet.sheet--bare[open]") return [dialog];
        if (selector === ".europe-app .europe-drinks select") return selected ? [selected] : [];
        if (selector === ".europe-app .europe-band input[type=checkbox]")
          return selected ? [{ checked: happyHour }] : [];
        throw new Error(`Unexpected selector ${selector}`);
      },
    },
  });
}

test("captures the real Europe selector and happy-hour band", () => {
  assert.match(europe, /class="europe-drinks"/);
  assert.match(europe, /class="europe-band"/);
  const key = `m${"a".repeat(24)}`;
  const value = capture({
    key,
    href: `https://www.dovebevo.com/mobile/?path=%2Fbar%2F${key}&c=u0nd9`,
    europeDrink: { code: "spritz", name: "Spritz" },
    happyHour: true,
  });
  assert.equal(value.status, "ready");
  assert.equal(value.drink, "Spritz");
  assert.equal(value.drinkCode, "spritz");
  assert.equal(value.hh, 1);
});

test("captures the legacy selected drink for a focused favourite", () => {
  const value = capture({
    key: "n123",
    href: "https://www.dovebevo.com/bar/n123?c=u0nd9",
    legacyDrink: "Birra media",
  });
  assert.equal(value.drinkCode, "beer_draft");
  assert.equal(value.hh, 0);
});

test("does not invent a drink when the venue has no selected category", () => {
  const value = capture({
    key: "n123",
    href: "https://www.dovebevo.com/bar/n123?c=u0nd9",
  });
  assert.equal(value.status, "ready");
  assert.equal(value.drinkCode, null);
});
