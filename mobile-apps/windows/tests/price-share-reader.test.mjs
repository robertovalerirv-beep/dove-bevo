import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../PriceShareReader.js", import.meta.url), "utf8");
const venue = "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9";

function capture({ url = venue, hidden = false, duplicate = false, selected = "n123", headingName = "Bar Milano" } = {}) {
  const element = (extra = {}) => ({
    isConnected: true, hidden: false, inert: false, parentElement: null,
    getAttribute: () => null,
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 }),
    ...extra,
  });
  const sheet = element({ matches: (selector) => selector === ":modal", getAttribute: (key) => key === "aria-label" ? "Bar Milano" : null });
  const heading = element({ parentElement: sheet, textContent: headingName });
  sheet.querySelector = () => heading;
  const marker = element({
    parentElement: sheet,
    hidden,
    dataset: {
      version: "1", venue: "n123", venueName: "Bar Milano", drink: "spritz", drinkName: "Spritz",
      hh: "0", amountMinor: "550", currency: "EUR", serving: "drink",
      provenance: "Prezzo segnalato dai clienti", confirmations: "4", tier: "affare", location: "Milano",
    },
  });
  sheet.contains = (node) => node === marker;
  const map = element({ getAttribute: (key) => key === "data-selected" ? selected : null });
  const document = {
    visibilityState: "visible",
    documentElement: { getAttribute: (key) => key === "data-dovebevo-mobile-shell" ? "1" : null },
    querySelectorAll(selector) {
      if (selector === "section.map[data-selected]") return [map];
      if (selector === "dialog.sheet.sheet--bare[open]" || selector === "dialog[open]") return [sheet];
      if (selector === '[data-dovebevo-share="1"]') return duplicate ? [marker, element({ parentElement: sheet })] : [marker];
      return [];
    },
  };
  const window = { visualViewport: null, innerWidth: 800, innerHeight: 600 };
  window.top = window;
  return runInNewContext(source, {
    window, document, URL, location: { href: url },
    getComputedStyle: () => ({ display: "block", visibility: "visible", contentVisibility: "visible", opacity: "1" }),
  });
}

test("reads one visible featured price with its original currency and provenance", () => {
  const snapshot = capture();
  assert.equal(snapshot?.href, venue);
  assert.equal(snapshot?.venue, "n123");
  assert.equal(snapshot?.amountMinor, "550");
  assert.equal(snapshot?.currency, "EUR");
  assert.equal(snapshot?.provenance, "Prezzo segnalato dai clienti");
});

test("rejects hidden, duplicate, foreign, and stale venue price markers", () => {
  assert.equal(capture({ hidden: true }), null);
  assert.equal(capture({ duplicate: true }), null);
  assert.equal(capture({ selected: "n124" }), null);
  assert.equal(capture({ headingName: "Other Bar" }), null);
  assert.equal(capture({ url: "https://www.dovebevo.com/mobile/" }), null);
});
