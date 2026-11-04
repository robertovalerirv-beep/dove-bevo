import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const script = readFileSync(resolve(here, "..", "SearchClick.js"), "utf8");
const home = readFileSync(resolve(here, "..", "..", "..", "src/app/app.tsx"), "utf8");
const europe = readFileSync(resolve(here, "..", "..", "web/europe/EuropeApp.tsx"), "utf8");

function openSearch(availableSelector) {
  let clicks = 0;
  const result = runInNewContext(script, {
    document: {
      querySelector(selector) {
        return selector
          .split(",")
          .map((item) => item.trim())
          .includes(availableSelector)
          ? { click: () => clicks++ }
          : null;
      },
    },
  });
  return { result, clicks };
}

test("Windows search opens the existing home map search", () => {
  assert.match(home, /class="btn search-field"/);
  assert.deepEqual(openSearch(".top__row button.search-field"), { result: true, clicks: 1 });
});

test("Windows search opens the app-only Europe map search", () => {
  assert.match(europe, /data-dovebevo-search="1"/);
  assert.deepEqual(openSearch('button[data-dovebevo-search="1"]'), {
    result: true,
    clicks: 1,
  });
});

test("Windows search reports unavailable instead of claiming to open", () => {
  assert.deepEqual(openSearch("unavailable"), { result: false, clicks: 0 });
});
