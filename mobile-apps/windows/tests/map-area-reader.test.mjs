import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const script = readFileSync(resolve(here, "..", "MapAreaReader.js"), "utf8");
const home = readFileSync(resolve(here, "..", "..", "..", "src/app/app.tsx"), "utf8");

function capture({ href = "https://www.dovebevo.com/", ready = true, visible = true } = {}) {
  const root = { parentElement: null };
  const map = {
    parentElement: root,
    isConnected: true,
    getAttribute(name) {
      return { "data-ready": ready ? "true" : "false", "data-center": "45.46350,9.18839", "data-zoom": "15.0" }[name];
    },
    getBoundingClientRect() { return { width: 600, height: 500, left: 0, top: 0, right: 600, bottom: 500 }; },
    closest() { return null; },
  };
  const window = {};
  window.top = window;
  return runInNewContext(script, {
    URL, window, location: { href },
    document: {
      documentElement: { getAttribute: () => "1" },
      querySelectorAll: () => [map],
    },
    getComputedStyle: () => ({ display: visible ? "block" : "none", visibility: "visible", opacity: "1" }),
    innerWidth: 600, innerHeight: 500,
  });
}

test("Windows Scopri reads the real map DOM contract", () => {
  assert.match(home, /data-center=\{view \? /);
  assert.match(home, /data-ready=\{ready \? /);
  const result = capture();
  assert.equal(result.href, "https://www.dovebevo.com/");
  assert.equal(result.latitude, 45.4635);
  assert.equal(result.longitude, 9.18839);
  assert.equal(result.zoom, 15);
});

test("Windows Scopri refuses unloaded, hidden, and foreign maps", () => {
  assert.equal(capture({ ready: false }), null);
  assert.equal(capture({ visible: false }), null);
  assert.equal(capture({ href: "https://evil.example/" }), null);
});
