import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const testBrowser = process.env.DOVEBEVO_BROWSER;
test("keyed Preact price rows preserve controls through promotion and rerender", async () => {
  const { chromium } = await import("@playwright/test");
  const preact = readFileSync(new URL(import.meta.resolve("preact")), "utf8");
  const adapter = readFileSync(new URL("../app-theme.js", import.meta.url), "utf8");
  const browser = await chromium.launch({ ...(testBrowser ? { executablePath: testBrowser } : {}), headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://www.dovebevo.com/**", async (route) => {
      if (route.request().url().endsWith("/preact.mjs")) return route.fulfill({ contentType: "text/javascript", body: preact });
      return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="it" data-theme="dark"><head><style nonce="localPreviewNonce0123456789"></style></head><body><div id="app"><div class="app"><header class="top"></header><main class="main"><input id="price" value="12,50"><div class="scontrino"><ul class="prices"></ul></div></main></div></div><script type="module">import {h,render} from '/preact.mjs'; const ul=document.querySelector('.prices'); window.draw=(ids)=>render(ids.map(id=>h('li',{class:'price',key:id,'data-id':id},h('span',{class:'price__name'},id),h('span',{class:'price__meta'},'date stale'),h('span',{class:'price__actions'},h('button',{onClick:e=>e.currentTarget.textContent='confirmed'},'confirm')))),ul); window.draw(['a','b']); window.ready=true;</script></body></html>` });
    });
    await page.goto("https://www.dovebevo.com/");
    await page.waitForFunction(() => window.ready);
    await page.evaluate(adapter);
    await page.locator('[data-id="b"] .dovebevo-price-toggle').focus();
    await page.evaluate(() => window.draw(['b','a']));
    await page.waitForFunction(() => !document.querySelector('[data-id="b"] .dovebevo-price-toggle') && document.querySelector('[data-id="a"] .dovebevo-price-toggle'));
    assert.equal(await page.locator('[data-id="b"]').getAttribute('data-dovebevo-collapsed'), null);
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'confirm');
    assert.equal(await page.locator('[data-id="a"] .price__meta').isVisible(), true);
    await page.locator('[data-id="a"] .dovebevo-price-toggle').click();
    await page.locator('[data-id="a"] .price__actions button').click();
    await page.locator('#price').focus();
    await page.evaluate(() => { const input=document.querySelector('#price'); input.setSelectionRange(1, 3); window.draw(['b','a']); });
    assert.deepEqual(await page.evaluate(() => { const input=document.querySelector('#price'); return [document.activeElement === input, input.value, input.selectionStart, input.selectionEnd]; }), [true, '12,50', 1, 3]);
    assert.equal(await page.locator('[data-id="a"] .price__actions button').textContent(), 'confirmed');
    assert.equal(await page.locator('[data-id="a"] .dovebevo-price-toggle').getAttribute('aria-expanded'), 'true');
    await page.evaluate(() => { document.documentElement.lang='en'; });
    await page.waitForFunction(() => document.querySelector('[data-id="a"] .dovebevo-price-toggle').textContent === 'Hide actions');
  } finally { await browser.close(); }
});
