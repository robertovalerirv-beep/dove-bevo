import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
/* global window, document, Event, PageTransitionEvent */
import { readFileSync } from "node:fs";
import test from "node:test";

const testBrowser = process.env.DOVEBEVO_BROWSER;
const early = readFileSync(new URL("../app-theme-start.js", import.meta.url), "utf8");
test("document-start guard precedes website listeners and ignores nonvisitor pages", async () => {
  assert.ok(Buffer.byteLength(early) < 8192);
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({
    ...(testBrowser ? { executablePath: testBrowser } : {}),
    headless: true,
  });
  const context = await browser.newContext();
  try {
    await context.addInitScript({ content: early });
    await context.route("https://www.dovebevo.com/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const visitor = path === "/";
      const fakeApp = path === "/bar/n123";
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head>${visitor ? '<link rel="icon" href="/brand/favicon.svg"><link rel="manifest" href="/manifest.webmanifest">' : ""}<script>document.documentElement.dataset.theme='dark'; window.seen=[];</script><script type="module">window.initialTheme=document.documentElement.dataset.theme; window.addEventListener('themechange',()=>window.seen.push('first:'+document.documentElement.dataset.theme)); window.addEventListener('themechange',()=>window.seen.push('second:'+document.documentElement.dataset.theme)); window.ready=true;</script></head><body>${visitor || fakeApp ? '<div id="app"></div>' : ""}</body></html>`,
      });
    });
    const page = await context.newPage();
    await page.goto("https://www.dovebevo.com/");
    await page.waitForFunction(() => window.ready);
    assert.equal(await page.evaluate(() => window.initialTheme), "light");
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
      window.dispatchEvent(new Event("themechange"));
    });
    assert.deepEqual(await page.evaluate(() => window.seen), ["first:light", "second:light"]);
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      document.documentElement.dataset.theme = "dark";
      window.dispatchEvent(new Event("themechange"));
    });
    assert.deepEqual(await page.evaluate(() => window.seen), [
      "first:light",
      "second:light",
      "first:light",
      "second:light",
    ]);
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
    });
    await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
    assert.deepEqual(await page.evaluate(() => window.seen.slice(-2)), [
      "first:light",
      "second:light",
    ]);
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
      document.documentElement.dataset.theme = "dark";
      window.dispatchEvent(new Event("themechange"));
    });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
    for (const path of ["/bar/n123", "/privacy", "/cdn-cgi/challenge-platform/"]) {
      await page.goto(`https://www.dovebevo.com${path}`);
      await page.waitForFunction(() => window.ready);
      assert.equal(await page.evaluate(() => window.initialTheme), "dark");
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
    }
  } finally {
    await context.close();
    await browser.close();
  }
});
