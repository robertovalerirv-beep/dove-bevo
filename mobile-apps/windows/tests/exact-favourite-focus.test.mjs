import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { runInNewContext } from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "..", "ExactFavouriteFocus.js"), "utf8");
const venue = "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=gcpvj";
const pint = venue + "&save_europe=beer_draft&band=normal&currency=GBP&serving=ml%3A568";
const small = venue + "&save_europe=beer_draft&band=normal&currency=GBP&serving=ml%3A400";

function focus({ target = pint, link = pint, href = venue, visible = true } = {}) {
  let scrolled = false;
  const row = {
    style: {},
    getClientRects: () => (visible ? [{}] : []),
    setAttribute(name, value) {
      this[name] = value;
    },
    scrollIntoView() {
      scrolled = true;
    },
  };
  const anchor = {
    href: link,
    getClientRects: () => (visible ? [{}] : []),
    closest: () => row,
  };
  const dialog = {
    matches: () => true,
    querySelectorAll: () => [anchor],
    contains: (candidate) => candidate === row,
  };
  const window = {};
  window.top = window;
  const script = source.replaceAll("__DOVE_BEVO_EXACT_TARGET__", JSON.stringify(target));
  const result = runInNewContext(script, {
    URL,
    window,
    location: { href },
    document: {
      documentElement: { getAttribute: () => "1" },
      querySelectorAll: () => [dialog],
    },
  });
  return { result, row, scrolled };
}

test("only the saved 568 ml GBP row is highlighted on the venue", () => {
  const saved = focus();
  assert.equal(saved.result, true);
  assert.equal(saved.row["data-dovebevo-exact-favourite"], "1");
  assert.equal(saved.scrolled, true);
  assert.equal(focus({ link: small }).result, false);
});

test("another venue, a hidden row, or a price command cannot be highlighted", () => {
  assert.equal(focus({ href: venue.replace("n123", "n124") }).result, false);
  assert.equal(focus({ visible: false }).result, false);
  assert.equal(focus({ target: venue + "&save_drink=beer_draft&band=normal" }).result, false);
});
