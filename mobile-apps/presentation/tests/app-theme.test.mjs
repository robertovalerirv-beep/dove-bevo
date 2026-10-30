import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { Buffer } from "node:buffer";
import { URL } from "node:url";

const source = readFileSync(new URL("../app-theme.js", import.meta.url), "utf8");

// Contract fixtures exercise the installer, not browser CSP/layout. The latter
// require real WebView/browser evidence and are reported separately.
function fixture(options = {}) {
  const nodes = new Map();
  const rootAttributes = new Map();
  const makeNode = (tag) => {
    const attrs = new Map();
    return {
      tagName: tag.toUpperCase(),
      textContent: "",
      setAttribute: (key, value) => attrs.set(key, value),
      getAttribute: (key) => attrs.get(key) ?? null,
      remove() {
        nodes.delete(this.id);
      },
    };
  };
  const root = {
    getAttribute: (key) => rootAttributes.get(key) ?? null,
    setAttribute: (key, value) => rootAttributes.set(key, value),
    removeAttribute: (key) => rootAttributes.delete(key),
  };
  const document = {
    documentElement: root,
    head: options.noHead ? null : { appendChild: (node) => nodes.set(node.id, node) },
    querySelector: () => (options.noShell ? null : {}),
    querySelectorAll: () =>
      options.noNonce ? [] : [{ nonce: options.nonce ?? "testResponseNonce0123456789==" }],
    getElementById: (id) => nodes.get(id) ?? null,
    createElement: makeNode,
  };
  if (options.collision) {
    const node = makeNode(options.collision);
    node.id = "dovebevo-native-theme-v1";
    nodes.set(node.id, node);
  }
  const window = { location: { href: options.url ?? "https://www.dovebevo.com/" } };
  window.top = options.frame ? {} : window;
  const context = vm.createContext({
    window,
    document,
    URL,
    getComputedStyle: () => ({
      getPropertyValue: () =>
        options.cspDenied
          ? ""
          : nodes.has("dovebevo-native-theme-v1") &&
              rootAttributes.get("data-dovebevo-app-theme") === "1"
            ? "1"
            : "",
    }),
  });
  return { run: () => vm.runInContext(source, context, { timeout: 1000 }), nodes, rootAttributes };
}

for (const url of [
  "https://www.dovebevo.com/",
  "https://dovebevo.com:443/",
  "https://www.dovebevo.com/bar/n4170005990?c=u0nd9h",
])
  test(`eligible visitor document ${url}`, () => {
    const page = fixture({ url });
    assert.equal(page.run(), true);
    assert.equal(page.nodes.size, 1);
    assert.equal(page.rootAttributes.get("data-dovebevo-app-theme"), "1");
    assert.match(page.nodes.values().next().value.textContent, /\.price-input input/);
  });

for (const url of [
  "http://www.dovebevo.com/",
  "https://www.dovebevo.com:444/",
  "https://www.dovebevo.com.evil.invalid/",
  "https://example.com/",
  "https://name@www.dovebevo.com/",
  "https://name:password@www.dovebevo.com/",
  "https://www.dovebevo.com/admin",
  "https://www.dovebevo.com/admin/verificati",
  "https://www.dovebevo.com/privacy",
  "https://www.dovebevo.com/regole",
  "https://www.dovebevo.com/cdn-cgi/challenge-platform/",
  "https://www.dovebevo.com/unknown",
  "https://www.dovebevo.com/bar/n0",
  "https://www.dovebevo.com/bar/n1/extra",
  "about:blank",
  "https://www.dovebevo.com/bar/n1234567890123456",
])
  test(`ineligible document unchanged ${url}`, () => {
    const page = fixture({ url });
    assert.equal(page.run(), false);
    assert.equal(page.nodes.size, 0);
    assert.equal(page.rootAttributes.size, 0);
  });

for (const option of ["frame", "noShell", "noNonce", "noHead", "cspDenied"]) {
  test(`${option} fails without leaving presentation mutation`, () => {
    const page = fixture({ [option]: true });
    assert.equal(page.run(), false);
    assert.equal(page.nodes.size, 0);
    assert.equal(page.rootAttributes.size, 0);
  });
}
for (const nonce of ["", "invalid nonce value", "short", "x".repeat(129)]) {
  test(`unusable response nonce is rejected by length and character bounds ${nonce.length}`, () => {
    const page = fixture({ nonce });
    assert.equal(page.run(), false);
    assert.equal(page.nodes.size, 0);
  });
}
for (const collision of ["div", "style"])
  test(`never overwrite unowned ${collision}`, () => {
    const page = fixture({ collision });
    const original = page.nodes.get("dovebevo-native-theme-v1");
    assert.equal(page.run(), false);
    assert.equal(page.nodes.get("dovebevo-native-theme-v1"), original);
    assert.equal(original.textContent, "");
    assert.equal(page.rootAttributes.size, 0);
  });
test("finish callback is idempotent and does not duplicate the style", () => {
  const page = fixture();
  assert.equal(page.run(), true);
  const original = page.nodes.get("dovebevo-native-theme-v1");
  assert.equal(page.run(), true);
  assert.equal(page.nodes.size, 1);
  assert.equal(page.nodes.get("dovebevo-native-theme-v1"), original);
});
test("CSS failure restores an earlier root marker", () => {
  const page = fixture({ cspDenied: true });
  page.rootAttributes.set("data-dovebevo-app-theme", "previous");
  assert.equal(page.run(), false);
  assert.equal(page.rootAttributes.get("data-dovebevo-app-theme"), "previous");
});
test("bundled script contains no remote CSS, data mutation or bridge", () => {
  assert.ok(Buffer.byteLength(source) < 32768);
  assert.doesNotMatch(
    source,
    /@import|url\s*\(|innerHTML|fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|postMessage|addJavascriptInterface|MutationObserver/,
  );
  assert.match(source, /style\.nonce = source\.nonce/);
  assert.match(source, /style\.textContent = css/);
});
