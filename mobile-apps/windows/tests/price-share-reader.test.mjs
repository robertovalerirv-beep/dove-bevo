import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../PriceShareReader.js", import.meta.url), "utf8");
const venue = "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9";
const offered = venue + "&offer=menu-123";
const headingSelector = ":scope > .sheet__body > .scontrino > .scontrino__paper h2.scontrino__name";

function capture({
  url = venue,
  hidden = false,
  duplicate = false,
  selected = "n123",
  headingName = "Bar Milano",
  save = "link",
  offerName = "Spritz della casa",
  offerHidden = false,
  ownerSpotlight = false,
  bothVisible = false,
} = {}) {
  const offerRoute = ownerSpotlight || new URL(url).searchParams.has("offer");
  const element = (extra = {}) => ({
    isConnected: true,
    hidden: false,
    inert: false,
    parentElement: null,
    getAttribute: () => null,
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
    }),
    ...extra,
  });
  const sheet = element({
    matches: (selector) => selector === ":modal",
    getAttribute: (key) => (key === "aria-label" ? "Bar Milano" : null),
  });
  const body = element({ parentElement: sheet });
  const receipt = element({ parentElement: body });
  const paper = element({ parentElement: receipt });
  const identity = element({ parentElement: paper });
  const heading = element({ parentElement: identity, textContent: headingName });
  const place = element({ parentElement: identity, textContent: "Bar · Milano" });
  const marker = element({
    parentElement: paper,
    hidden,
    dataset: {
      version: "1",
      venue: "n123",
      venueName: "Bar Milano",
      drink: "spritz",
      drinkName: "Spritz",
      hh: "0",
      amountMinor: "550",
      currency: "EUR",
      serving: "drink",
      provenance: "Prezzo segnalato dai clienti",
      confirmations: "4",
      tier: "affare",
      location: "Milano",
    },
  });
  const offerRow = element({ parentElement: paper, hidden: offerHidden });
  const name = element({
    parentElement: offerRow,
    childNodes: [
      { nodeType: 3, textContent: offerName },
      { nodeType: 1, textContent: "Prezzo da menu" },
    ],
  });
  const amount = element({ parentElement: offerRow, textContent: "8,50 €" });
  const firstNote = element({ parentElement: offerRow, textContent: "50 cl · Happy hour" });
  const secondNote = element({
    parentElement: offerRow,
    textContent: "Prezzo del drink da menu, non totale pagato. Supplementi separati.",
  });
  const menuSource = element({
    parentElement: offerRow,
    textContent: "Menu verificato il 2026-11-19",
  });
  const saveAction = element({
    parentElement: offerRow,
    tagName: save === "saved" ? "SPAN" : "A",
    getAttribute(key) {
      if (key === "href")
        return (
          "/mobile/?path=%2Fbar%2Fn123&c=u0nd9&save_offer=" +
          (save === "wrong" ? "menu-456" : "menu-123")
        );
      if (key === "data-saved") return "true";
      if (key === "aria-label") return `${offerName} da Bar Milano: nei preferiti`;
      return null;
    },
  });
  offerRow.querySelectorAll = (selector) =>
    ({
      ":scope > .mobile-menu-v2__name": [name],
      ":scope > .mobile-menu-v2__amount": [amount],
      ":scope > .mobile-menu-v2__source": [menuSource],
      ":scope > .mobile-menu-v2__meta": [firstNote, secondNote],
      ":scope .mobile-menu-v2__quick-actions > .mobile-menu-v2__save": [saveAction],
    })[selector] ?? [];
  sheet.querySelectorAll = (selector) =>
    ({
      [headingSelector]: [heading],
      'li.mobile-menu-v2__offer--focused[data-testid="featured-menu-price"]':
        offerRoute || bothVisible ? [offerRow] : [],
    })[selector] ?? [];
  sheet.querySelector = (selector) => (selector === ".scontrino__paper .bar__kind" ? place : null);
  sheet.contains = (node) => node === marker;
  const map = element({ getAttribute: (key) => (key === "data-selected" ? selected : null) });
  const document = {
    visibilityState: "visible",
    documentElement: { getAttribute: (key) => (key === "data-dovebevo-mobile-shell" ? "1" : null) },
    querySelectorAll(selector) {
      if (selector === "section.map[data-selected]") return [map];
      if (selector === "dialog.sheet.sheet--bare[open]" || selector === "dialog[open]")
        return [sheet];
      if (selector === '[data-dovebevo-share="1"]')
        return offerRoute && !bothVisible
          ? []
          : duplicate
            ? [marker, element({ parentElement: paper })]
            : [marker];
      return [];
    },
  };
  const window = { visualViewport: null, innerWidth: 800, innerHeight: 600 };
  window.top = window;
  return runInNewContext(source, {
    window,
    document,
    URL,
    location: { href: url },
    getComputedStyle: () => ({
      display: "block",
      visibility: "visible",
      contentVisibility: "visible",
      opacity: "1",
    }),
  });
}

test("reads a customer price under the actual nested BarSheet identity header", () => {
  const snapshot = capture();
  assert.equal(snapshot?.href, venue);
  assert.equal(snapshot?.venue, "n123");
  assert.equal(snapshot?.amountMinor, "550");
  assert.equal(snapshot?.currency, "EUR");
  assert.equal(snapshot?.provenance, "Prezzo segnalato dai clienti");
});

test("reads the selected owner-menu offer without inventing confirms or a category", () => {
  const snapshot = capture({ url: offered });
  assert.equal(snapshot?.kind, "offer");
  assert.equal(snapshot?.href, offered);
  assert.equal(snapshot?.offer, "menu-123");
  assert.equal(snapshot?.drinkName, "Spritz della casa");
  assert.equal(snapshot?.amountLabel, "8,50 €");
  assert.match(snapshot?.provenance, /non totale pagato.*Menu verificato il 2026-11-19/);
  assert.equal(snapshot?.confirmations, undefined);
  assert.equal(capture({ url: offered, save: "saved" })?.offer, "menu-123");
});

test("reads a map-selected owner-menu price on the ordinary two-param venue route", () => {
  const unsaved = capture({ ownerSpotlight: true });
  assert.equal(unsaved?.kind, "offer");
  assert.equal(unsaved?.href, venue);
  assert.equal(unsaved?.offer, "menu-123");
  assert.equal(unsaved?.amountLabel, "8,50 €");
  const saved = capture({ ownerSpotlight: true, save: "saved" });
  assert.equal(saved?.kind, "offer");
  assert.equal(saved?.offer, ""); // Native resolves this visible row by an exact unique live menu match.
  assert.equal(capture({ ownerSpotlight: true, save: "wrong" })?.offer, "menu-456");
  assert.equal(capture({ url: offered, save: "wrong" }), null);
});

test("rejects hidden, duplicate, foreign, and stale venue price markers", () => {
  assert.equal(capture({ hidden: true }), null);
  assert.equal(capture({ duplicate: true }), null);
  assert.equal(capture({ bothVisible: true }), null);
  assert.equal(capture({ selected: "n124" }), null);
  assert.equal(capture({ headingName: "Other Bar" }), null);
  assert.equal(capture({ url: "https://www.dovebevo.com/mobile/" }), null);
  assert.equal(capture({ url: offered, offerHidden: true }), null);
  assert.equal(capture({ url: offered, save: "wrong" }), null);
  assert.equal(capture({ url: offered.replace("menu-123", "menu-456") }), null);
});
