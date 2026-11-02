import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import test from "node:test";
/* global window, document, getComputedStyle */

const art = readFileSync(new URL("../drink-art.js", import.meta.url), "utf8");
const theme = readFileSync(new URL("../app-theme.js", import.meta.url), "utf8");

test("bundled artwork contains the exact app encoding and stays below its separate resource budget", () => {
  const picture = readFileSync(new URL("../assets/spritz-illustration.jpg", import.meta.url));
  const encoded = art.match(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/)?.[1];
  assert.ok(encoded);
  assert.deepEqual(Buffer.from(encoded, "base64"), picture);
  assert.equal(
    createHash("sha256").update(picture).digest("hex"),
    "374e91b2a7852b3b10ca7e0839eefaeb19f38986ad2589e0501567e9a234314c",
  );
  assert.ok(Buffer.byteLength(art) < 256 * 1024);
  assert.ok(Buffer.byteLength(theme) < 32 * 1024);
});

test("real CSP form keeps original input, header actions and readable drink selection through artwork changes", async () => {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.DOVEBEVO_BROWSER ? { executablePath: process.env.DOVEBEVO_BROWSER } : {}),
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const requests = [];
    await page.route("**/*", (route) => {
      requests.push([route.request().method(), route.request().url()]);
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="it"><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-localPreviewNonce0123456789'; img-src data:"><style nonce="localPreviewNonce0123456789">.drink-option{display:inline-flex;align-items:center;color:white;background:#111}.context-tag{display:flex}.sheet__head{display:flex} .price-input{display:flex} .price-input input{font:inherit} .sheet{max-width:390px} .icon{width:24px;height:24px}</style></head><body><div id="app"><div class="app"><header class="top"><div class="drink-menu"><div class="drink-menu__list"><label class="drink-option"><input type="checkbox" checked>Spritz</label></div></div></header><main class="main"><section class="sheet"><header class="sheet__head"><button class="btn" type="button">Indietro</button><h2 class="sheet__title">Un locale con un nome abbastanza lungo</h2><button class="btn" type="button">Chiudi</button></header><div class="sheet__body"><form><h3 class="context-tag">Spritz</h3><label class="price-input"><input aria-label="Prezzo in euro" value="5,50"><span>€</span></label><button type="submit">Salva</button></form></div></section></main></div></div></body></html>`,
      });
    });
    await page.goto("https://www.dovebevo.com/");
    await page.evaluate(() => {
      window.fixtureSubmissions = 0;
      document.querySelector("form").addEventListener("submit", (event) => {
        event.preventDefault();
        window.fixtureSubmissions++;
      });
      const input = document.querySelector("input[aria-label]");
      input.focus();
      input.setSelectionRange(1, 3);
      window.originalInput = input;
    });
    await page.evaluate(art);
    await page.evaluate(theme);
    await page.waitForFunction(
      () => document.querySelector("img.dovebevo-drink-art")?.naturalWidth > 0,
    );
    assert.deepEqual(
      await page
        .locator(".drink-option")
        .evaluate((node) => [getComputedStyle(node).backgroundColor, getComputedStyle(node).color]),
      ["rgb(16, 24, 32)", "rgb(255, 255, 255)"],
    );
    assert.equal(
      await page.locator(".sheet__title").textContent(),
      "Un locale con un nome abbastanza lungo",
    );
    assert.equal(
      await page.locator(".dovebevo-form-action-title").textContent(),
      "Aggiungi un prezzo",
    );
    assert.equal(await page.getByRole("button", { name: "Chiudi" }).count(), 1);
    assert.deepEqual(
      await page.evaluate(() => {
        const input = document.querySelector("input[aria-label]");
        return [
          input === window.originalInput,
          document.activeElement === input,
          input.value,
          input.selectionStart,
          input.selectionEnd,
        ];
      }),
      [true, true, "5,50", 1, 3],
    );
    await page.evaluate(() => {
      document.querySelector("h3.context-tag").lastChild.textContent = "Negroni";
    });
    await page.waitForFunction(() => !document.querySelector("img.dovebevo-drink-art"));
    assert.equal(await page.locator("h3.context-tag").textContent(), "Negroni");
    await page.getByRole("button", { name: "Salva", exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureSubmissions), 1);
    assert.deepEqual(requests, [["GET", "https://www.dovebevo.com/"]]);
    await page.goto("https://www.dovebevo.com/admin");
    await page.evaluate(art);
    await page.evaluate(theme);
    assert.equal(await page.locator("img.dovebevo-drink-art").count(), 0);
    assert.equal(await page.locator(".dovebevo-form-action-title").count(), 0);
  } finally {
    await browser.close();
  }
});
