import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL, URLSearchParams } from "node:url";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import {
  mobilePath,
  mobileURL,
  mobileDefaultDrink,
  mobileFocus,
  menuOfferMatchesFocus,
} from "../routes.ts";
import { transformApp, transformMap, mobileMapStyle } from "../build-contract.mjs";
import { mobilePinLabel } from "../map-pins.ts";
import { renderSw } from "../../../scripts/sw.ts";

const read = (name) => readFileSync(new URL(`../../../src/${name}`, import.meta.url), "utf8");
const origin = "https://www.dovebevo.com";

test("map and venue routes survive reload as real mobile assets", () => {
  assert.equal(mobileURL("/", origin), "/mobile/");
  const venue = mobileURL("/bar/n123?c=u0nd9", origin);
  assert.equal(venue, "/mobile/?path=%2Fbar%2Fn123&c=u0nd9");
  const url = new URL(venue, origin);
  assert.equal(mobilePath(url), "/bar/n123");
  assert.equal(mobileURL("/?at=45.4642,9.19", origin), "/mobile/?at=45.4642%2C9.19");
  assert.equal(mobileDefaultDrink("beer_draft"), "spritz");
});

test("mobile owner-verified venue links retain exact m identity", () => {
  const key = "maaaaaaaaaaaaaaaaaaaaaaaa";
  const url = mobileURL(`/bar/${key}?c=u0nd9`, origin);
  assert.equal(url, `/mobile/?path=%2Fbar%2F${key}&c=u0nd9`);
  assert.equal(mobilePath(new URL(url, origin)), `/bar/${key}`);
  for (const bad of ["m" + "A".repeat(24), "m" + "a".repeat(23), "m" + "a".repeat(25)])
    assert.throws(() => mobileURL(`/bar/${bad}?c=u0nd9`, origin), TypeError);
});

test("saved drink links keep the exact drink and happy-hour band", () => {
  for (const key of ["n123", "maaaaaaaaaaaaaaaaaaaaaaaa"]) {
    const link = mobileURL(`/bar/${key}?c=u0nd9&drink=negroni&hh=1`, origin);
    assert.equal(link, `/mobile/?path=%2Fbar%2F${key}&c=u0nd9&drink=negroni&hh=1`);
    const parsed = new URL(link, origin);
    assert.equal(mobilePath(parsed), `/bar/${key}`);
    assert.deepEqual(mobileFocus(parsed), { drink: "negroni", hh: 1 });
    assert.equal(mobileDefaultDrink("beer_draft", parsed), "negroni");
  }
  assert.equal(mobileFocus(new URL("/mobile/?path=/bar/n123&c=u0nd9", origin)), null);
  assert.equal(
    menuOfferMatchesFocus(
      { category: "negroni", context: { kind: "happy_hour" } },
      { drink: "negroni", hh: 1 },
    ),
    true,
  );
  for (const kind of ["regular", "conditional"])
    assert.equal(
      menuOfferMatchesFocus(
        { category: "negroni", context: { kind } },
        { drink: "negroni", hh: 1 },
      ),
      false,
    );
});

test("partial or duplicate saved drink links fail closed", () => {
  for (const search of [
    "?path=/bar/n123&c=u0nd9&drink=spritz",
    "?path=/bar/n123&c=u0nd9&hh=1",
    "?path=/bar/n123&c=u0nd9&drink=spritz&drink=negroni&hh=0",
    "?path=/bar/n123&c=u0nd9&drink=spritz&hh=0&hh=1",
    "?path=/bar/n123&c=u0nd9&drink=unknown&hh=0",
    "?path=/bar/n123&c=u0nd9&drink=spritz&hh=2",
    "?path=/bar/n123&c=u0nd9&drink=spritz&hh=0&token=private",
  ]) {
    assert.equal(mobilePath({ pathname: "/mobile/", search }), "/", search);
    assert.equal(mobileFocus({ pathname: "/mobile/", search }), null, search);
  }
  assert.equal(
    mobilePath({
      pathname: "/mobile/",
      search: "?path=/bar/n123&c=u0nd9&drink=spritz&hh=0",
      hash: "#bad",
    }),
    "/",
  );
  for (const path of [
    "/bar/n123?c=u0nd9&drink=spritz",
    "/bar/n123?c=u0nd9&drink=spritz&drink=negroni&hh=0",
    "/bar/n123?c=u0nd9&drink=spritz&hh=0&token=private",
    "/bar/n123?c=u0nd9&drink=spritz&hh=0&path=/bar/n123",
    "/bar/n123?c=u0nd9&dr%69nk=spritz&hh=0",
  ])
    assert.throws(() => mobileURL(path, origin), TypeError, path);
  assert.throws(() => mobileURL("/?drink=spritz&hh=0", origin), TypeError);
});

test("malformed duplicate and external venue routes fail closed", () => {
  for (const path of [
    "https://evil.test/bar/n123?c=u0nd9",
    "//evil.test/",
    "/bar/n123",
    "/bar/n123?c=wrong",
    "/bar/n123?c=u0nd9&c=u0nd8",
    "/bar/n123?c=u0nd9#bad",
    "/admin",
    "/bar/n123/",
    "/bar/../../admin",
  ]) {
    assert.throws(() => mobileURL(path, origin), TypeError, path);
  }
  for (const search of [
    "?path=/bar/n123&c=u0nd9&c=u0nd8",
    "?path=/bar/n123&path=/bar/n456&c=u0nd9",
    "?path=https://evil.test/&c=u0nd9",
    "?path=/bar/n123&c=wrong",
  ]) {
    assert.equal(mobilePath({ pathname: "/mobile/", search }), "/");
  }
  assert.equal(mobilePath({ pathname: "/", search: "?path=/bar/n123&c=u0nd9" }), "/");
});

test("Safari 16.4 routes retain identity and map position without URLSearchParams.size", () => {
  const descriptor = Object.getOwnPropertyDescriptor(URLSearchParams.prototype, "size");
  assert.ok(descriptor);
  assert.equal(Reflect.deleteProperty(URLSearchParams.prototype, "size"), true);
  try {
    const venue = mobileURL("/bar/n123?c=u0nd9", origin);
    assert.equal(venue, "/mobile/?path=%2Fbar%2Fn123&c=u0nd9");
    assert.equal(mobilePath(new URL(venue, origin)), "/bar/n123");
    assert.equal(mobileURL("/?at=51.5074,-0.1278", origin), "/mobile/?at=51.5074%2C-0.1278");
    assert.throws(() => mobileURL("/bar/n123?c=u0nd9&c=u0nd8", origin), TypeError);
    assert.equal(
      mobilePath(new URL("/mobile/?path=/bar/n123&path=/bar/n456&c=u0nd9", origin)),
      "/",
    );
    assert.equal(mobileURL("/bar/n123?c=u0nd9&token=private", origin), venue);
  } finally {
    Object.defineProperty(URLSearchParams.prototype, "size", descriptor);
  }
});

test("compile-time seams preserve original source and reject upstream drift", () => {
  const app = read("app/app.tsx"),
    map = read("app/lib/maplibre-map.ts");
  assert.match(transformApp(app), /history\.pushState\(\{ inApp: true \}, "", mobileURL\(path\)\)/);
  assert.match(transformApp(app), /mobilePath\(location\)/);
  assert.match(transformApp(app), /loadMobileCell\(cell, drinks\)/);
  assert.match(transformApp(app), /mobileMenuPin\(v, drinks\)/);
  assert.match(transformApp(app), /MobileMapActions onAddPrice/);
  assert.match(transformApp(app), /MapContributeActions/);
  assert.match(transformApp(app), /dovebevo:menu-cell-ready/);
  assert.match(transformApp(app), /venues=\{legacyPriceVenues\(everyVenue\)\}/);
  assert.match(transformApp(app), /prefill\?\.venue\.key\.startsWith\("m"\)/);
  assert.match(transformApp(app), /mobileVenueKeyPattern\.test\(match\[1\]\)/);
  assert.match(transformApp(app), /const restoredDrink = mobileFocus\(location\)/);
  assert.match(transformApp(app), /if \(restoredDrink\) setDrinks\(\[restoredDrink\.drink\]\)/);
  assert.doesNotMatch(app, /loadMobileCell|mobileMenuPin/);
  assert.match(transformMap(map, '"/assets/mobile/test.json"'), /"icon-anchor": "bottom"/);
  assert.match(transformMap(map, '"/assets/mobile/test.json"'), /\[0, -25\]/);
  assert.throws(() => transformApp(app + "\n"), /Review updated website/);
  assert.throws(() => transformMap(map + "\n", '"unused"'), /Review updated website/);
  assert.equal(read("app/app.tsx"), app);
  assert.equal(read("app/lib/maplibre-map.ts"), map);
});

test("map restyling retains licensed source and attribution identity", () => {
  const original = {
    sources: { world: { attribution: "OSM", url: "https://tiles.openfreemap.org/planet" } },
    sprite: "same",
    layers: [{ id: "water", type: "fill", paint: { "fill-color": "red" } }],
  };
  const result = mobileMapStyle(original);
  assert.deepEqual(result.sources, original.sources);
  assert.equal(result.sprite, original.sprite);
  assert.equal(result.layers[0].paint["fill-color"], "#b9dfed");
  assert.equal(original.layers[0].paint["fill-color"], "red");
});

test("happy-hour and longer amounts retain separate readable price and HH cues", () => {
  assert.deepEqual(mobilePinLabel("6,00 € Happy hour"), { amount: "6,00", detail: "HH" });
  assert.deepEqual(mobilePinLabel("6,00 € HH"), { amount: "6,00", detail: "HH" });
  assert.deepEqual(mobilePinLabel("125,00 €"), { amount: "125,00", detail: "" });
  assert.deepEqual(mobilePinLabel("7,50 € MENU"), { amount: "7,50", detail: "M+" });
  assert.deepEqual(mobilePinLabel("30 VOCI"), { amount: "30", detail: "MENU" });
  assert.deepEqual(mobilePinLabel("2 PREZZI"), { amount: "2", detail: "PREZZI" });
  assert.deepEqual(mobilePinLabel("£7.50"), { amount: "7.50", detail: "£" });
  assert.deepEqual(mobilePinLabel("7,50 £ HH"), { amount: "7,50", detail: "£ HH" });
});

test("existing website service worker returns its legacy shell offline, requiring a native marker check", async () => {
  const handlers = new Map();
  let online = true;
  const legacy = { marker: "website" },
    mobile = { marker: "mobile" };
  runInNewContext(renderSw(["/"], "fixture"), {
    URL,
    self: {
      location: { origin },
      addEventListener: (name, handler) => handlers.set(name, handler),
    },
    caches: {
      match: async (url) => {
        assert.equal(url, "/");
        return legacy;
      },
    },
    fetch: async () => {
      if (!online) throw new Error("offline");
      return mobile;
    },
  });
  let response;
  const event = {
    request: { method: "GET", mode: "navigate", url: `${origin}/mobile/` },
    respondWith: (promise) => {
      response = promise;
    },
  };
  handlers.get("fetch")(event);
  assert.equal(await response, mobile);
  online = false;
  handlers.get("fetch")(event);
  assert.equal(await response, legacy);
});
