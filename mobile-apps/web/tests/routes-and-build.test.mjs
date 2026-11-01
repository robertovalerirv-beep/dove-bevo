import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { mobilePath, mobileURL, mobileDefaultDrink } from "../routes.ts";
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

test("compile-time seams preserve original source and reject upstream drift", () => {
  const app = read("app/app.tsx"),
    map = read("app/lib/maplibre-map.ts");
  assert.match(transformApp(app), /history\.pushState\(\{ inApp: true \}, "", mobileURL\(path\)\)/);
  assert.match(transformApp(app), /mobilePath\(location\)/);
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
