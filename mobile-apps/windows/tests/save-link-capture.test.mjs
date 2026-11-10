import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { runInNewContext } from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "..", "SaveLinkCapture.js"), "utf8");

function capture({ venue = "Test Bar", label, target, hidden = false, shell = true }) {
  const script = source.replaceAll("__DOVE_BEVO_SAVE_TARGET__", JSON.stringify(target));
  const heading = { textContent: venue, getClientRects: () => [{}] };
  const link = {
    href: target,
    getClientRects: () => (hidden ? [] : [{}]),
    getAttribute: () => label,
  };
  const dialog = {
    matches: () => true,
    querySelector: () => heading,
    querySelectorAll: () => [link],
  };
  const window = {};
  window.top = window;
  return runInNewContext(script, {
    URL,
    window,
    location: { href: "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9" },
    document: {
      documentElement: { getAttribute: () => (shell ? "1" : null) },
      querySelectorAll: () => [dialog],
    },
  });
}

test("captures the visible exact Italian row without asking for a name", () => {
  const target =
    "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&save_drink=spritz&band=normal";
  const result = capture({ label: "Salva Spritz da Test Bar nei preferiti", target });
  assert.equal(result.status, "ready");
  assert.equal(result.venueName, "Test Bar");
  assert.equal(result.drinkName, "Spritz");
  assert.equal(result.target, target);
});

test("retains original serving in a European drink label", () => {
  const target =
    "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&save_europe=beer_draft&band=normal&currency=GBP&serving=ml%3A568";
  const result = capture({
    label: "Salva Birra media 568 ml da Test Bar nei preferiti",
    target,
  });
  assert.equal(result.drinkName, "Birra media 568 ml");
});

test("hidden or mismatched links never produce a private save", () => {
  const target =
    "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&save_drink=spritz&band=normal";
  assert.equal(
    capture({ label: "Salva Spritz da Test Bar nei preferiti", target, hidden: true }).status,
    "unavailable",
  );
  assert.equal(
    capture({ label: "Salva Spritz da Other Bar nei preferiti", target }).status,
    "unavailable",
  );
  assert.equal(
    capture({ label: "Salva Spritz da Test Bar nei preferiti", target, shell: false }).status,
    "unavailable",
  );
});
