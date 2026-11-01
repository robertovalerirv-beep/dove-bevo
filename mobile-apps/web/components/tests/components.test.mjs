import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdirSync, mkdtempSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { Buffer } from "node:buffer";
import { after, before, test } from "node:test";
import { build } from "vite";
import preact from "@preact/preset-vite";
import { chromium } from "@playwright/test";
/* global window */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
let browser;
let files;
before(async () => {
  const outputRoot = path.join(here, "dist");
  mkdirSync(outputRoot, { recursive: true });
  const outDir = mkdtempSync(path.join(outputRoot, "run-"));
  assert.ok(path.resolve(outDir).startsWith(path.resolve(outputRoot) + path.sep));
  await build({
    configFile: false,
    root,
    publicDir: false,
    base: "/assets/fixtures/",
    logLevel: "silent",
    plugins: [
      preact(),
      {
        name: "test-only-drink-asset",
        resolveId(id) {
          if (id === "@mobile/drink-images") return "\0fixture-drink-images";
        },
        load(id) {
          if (id === "\0fixture-drink-images")
            return 'export const drinkImage = (code) => code === "spritz" ? "/fixture-drink.png" : undefined;';
        },
      },
    ],
    resolve: { alias: { "@site": path.join(root, "src") } },
    build: {
      outDir,
      emptyOutDir: false,
      lib: { entry: path.join(here, "fixture.tsx"), formats: ["es"], fileName: "fixture" },
      cssCodeSplit: false,
      rolldownOptions: { output: { assetFileNames: "[name][extname]" } },
    },
  });
  files = new Map(readdirSync(outDir).map((name) => [name, readFileSync(path.join(outDir, name))]));
  browser = await chromium.launch({
    headless: true,
    ...(process.env.DOVEBEVO_BROWSER ? { executablePath: process.env.DOVEBEVO_BROWSER } : {}),
  });
});
after(async () => {
  await browser?.close();
});

const priceRows = [
  ["n123", "gin_tonic", 0, 800, "2026-01-01", 0, 0],
  ["n123", "spritz", 0, 600, "2026-10-28", 2, 0],
  ["n123", "beer_draft", 0, 1000, "2026-10-28", 0, 1],
];
async function fixture() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const writes = [];
  await page.route("**/*", (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      writes.push(request.method());
      return route.abort();
    }
    if (pathname === "/")
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="it" data-theme="light"><head><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; require-trusted-types-for 'script'; trusted-types default"><link rel="stylesheet" href="/assets/fixtures/fixture.css"></head><body><div id="fixture-root"></div><script type="module" src="/assets/fixtures/fixture.js"></script></body></html>`,
      });
    if (pathname.startsWith("/assets/fixtures/")) {
      const name = path.basename(pathname),
        data = files.get(name);
      return data
        ? route.fulfill({
            contentType: name.endsWith(".css") ? "text/css" : "text/javascript",
            body: data,
          })
        : route.abort();
    }
    if (pathname === "/fixture-drink.png")
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfQAAAABJRU5ErkJggg==",
          "base64",
        ),
      });
    if (pathname === "/data/fixture/v/u0nd9.json")
      return route.fulfill({
        json: {
          c: [[1, "Milano"]],
          v: [["n123", "Locale di prova <strong>", 1, 45.4642, 9.19, "Via di prova 1", 0]],
        },
      });
    if (pathname === "/api/prices/u0nd9")
      return route.fulfill({
        json: {
          p: priceRows,
          u: [],
          pend: [["u6", "Pending must not appear", 1, 45.4642, 9.19, 0]],
          h: [],
          g: [],
        },
      });
    if (pathname.startsWith("/api/venues/"))
      return route.fulfill({ json: { p: priceRows, h: [] } });
    return route.abort();
  });
  await page.goto("https://sheets.fixture.test/");
  await page.waitForFunction(() => window.sheetFixture);
  return { page, writes, close: () => context.close() };
}

test("venue cards preserve escaped identity, current data and expandable real actions", async () => {
  const f = await fixture();
  try {
    await f.page.evaluate(() => window.sheetFixture.bar());
    await f.page.locator("h2.scontrino__name").waitFor();
    assert.equal(
      await f.page.locator("h2.scontrino__name").textContent(),
      "Locale di prova <strong>",
    );
    assert.equal(await f.page.locator("h2.scontrino__name strong").count(), 0);
    assert.equal(await f.page.locator(".bar__addr").textContent(), "Via di prova 1");
    const primary = f.page.locator(".mobile-price--featured");
    assert.match(await primary.innerText(), /Spritz[\s\S]*6,00 €[\s\S]*2 conferme/);
    assert.equal(await primary.locator(".mobile-price__tier").count(), 0);
    await primary.getByRole("button", { name: "Confermo", exact: true }).dblclick();
    await primary.getByRole("button", { name: "Confermato", exact: true }).waitFor();
    assert.equal(
      await f.page.evaluate(
        () => window.sheetFixture.calls.filter((call) => call.kind === "confirm").length,
      ),
      1,
    );
    const secondary = f.page.locator("li.mobile-price").filter({ hasText: "Gin tonic" });
    assert.equal(await secondary.locator(".price__meta").isVisible(), true);
    assert.match(await secondary.locator(".price__meta").innerText(), /Da confermare/);
    assert.equal(
      await secondary.getByRole("button", { name: "È cambiato", exact: true }).count(),
      0,
    );
    await secondary.getByRole("button", { name: /Azioni sul prezzo/ }).click();
    await secondary.getByRole("button", { name: "È cambiato", exact: true }).click();
    assert.equal(
      await f.page.evaluate(() =>
        window.sheetFixture.calls.some(
          (call) => call.kind === "changed" && call.venue === "n123" && call.drink === "gin_tonic",
        ),
      ),
      true,
    );
    await f.page.getByRole("button", { name: "Aggiungi un prezzo qui", exact: true }).click();
    assert.equal(
      await f.page.evaluate(() =>
        window.sheetFixture.calls.some((call) => call.kind === "add" && call.venue === "n123"),
      ),
      true,
    );
    await f.page
      .getByRole("button", { name: "Segnala un problema con il bar", exact: true })
      .click();
    assert.equal(
      await f.page.evaluate(() =>
        window.sheetFixture.calls.some(
          (call) => call.kind === "report" && call.drink === undefined,
        ),
      ),
      true,
    );
    await f.page.evaluate(() => window.sheetFixture.bar(["spritz"], "u6"));
    await f.page
      .getByText("Questo locale non è più sulla mappa.", { exact: true })
      .first()
      .waitFor();
    assert.equal(await f.page.locator("h2.scontrino__name").count(), 0);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("price form keeps bounds, prefill errors, exact cents and happy-hour callbacks", async () => {
  const f = await fixture();
  try {
    await f.page.evaluate(() =>
      window.sheetFixture.price({
        venue: window.sheetFixture.venue,
        drink: "spritz",
        error: "Owned server error",
      }),
    );
    assert.equal(await f.page.locator(".sheet__title").textContent(), "Aggiungi un prezzo");
    assert.equal(
      await f.page.locator(".mobile-price-flow__venue").textContent(),
      "Locale di prova <strong>",
    );
    assert.equal(
      await f.page.getByRole("button", { name: "Salva", exact: true }).isDisabled(),
      true,
    );
    assert.match(await f.page.getByRole("alert").innerText(), /Owned server error/);
    await f.page.getByRole("textbox", { name: "Prezzo in euro" }).fill("0,01");
    await f.page.getByRole("button", { name: "Salva", exact: true }).click();
    assert.equal(
      await f.page.evaluate(
        () => window.sheetFixture.calls.filter((call) => call.kind === "save").length,
      ),
      0,
    );
    assert.match(await f.page.getByRole("alert").innerText(), /prezzo insolito/);
    await f.page.getByRole("textbox", { name: "Prezzo in euro" }).fill("5,50");
    await f.page.getByRole("switch", { name: "Happy hour" }).click();
    await f.page.getByRole("button", { name: "Salva", exact: true }).click();
    assert.deepEqual(
      await f.page.evaluate(() => window.sheetFixture.calls.filter((call) => call.kind === "save")),
      [{ kind: "save", venue: "n123", drink: "spritz", hh: 1, cents: 550 }],
    );
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("changing the selected drink preserves confirmation state and visible keyboard focus", async () => {
  const f = await fixture();
  try {
    await f.page.evaluate(() => window.sheetFixture.bar());
    const spritz = f.page.locator("li.mobile-price").filter({ hasText: "Spritz" });
    await spritz.getByRole("button", { name: "Confermo", exact: true }).click();
    const confirmed = spritz.getByRole("button", { name: "Confermato", exact: true });
    await confirmed.waitFor();
    await confirmed.focus();
    await f.page.evaluate(() => window.sheetFixture.bar(["gin_tonic"]));
    const toggle = spritz.locator(".mobile-price__toggle");
    assert.equal(
      await toggle.evaluate((element) => element === element.ownerDocument.activeElement),
      true,
    );
    await toggle.click();
    assert.equal(await confirmed.isVisible(), true);
    assert.equal(await confirmed.getAttribute("aria-disabled"), "true");
    await toggle.focus();
    await f.page.evaluate(() => window.sheetFixture.bar(["spritz"]));
    assert.equal(
      await spritz
        .getByRole("button", { name: "È cambiato", exact: true })
        .evaluate((element) => element === element.ownerDocument.activeElement),
      true,
    );
    const review = f.page.locator("li.mobile-price").filter({ hasText: "Birra media" });
    await review.getByRole("button", { name: /Azioni sul prezzo/ }).click();
    assert.equal(await review.getByRole("button", { name: "È cambiato", exact: true }).count(), 0);
    assert.equal(
      await review.getByRole("button", { name: "Confermo", exact: true }).isVisible(),
      true,
    );
    assert.equal(
      await f.page.evaluate(
        () => window.sheetFixture.calls.filter((call) => call.kind === "confirm").length,
      ),
      1,
    );
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("small screens retain scroll access and 48 pixel price actions", async () => {
  const f = await fixture();
  try {
    await f.page.setViewportSize({ width: 320, height: 568 });
    await f.page.evaluate(() => window.sheetFixture.bar());
    await f.page.locator("h2.scontrino__name").waitFor();
    const layout = await f.page.locator(".sheet__body").evaluate((element) => ({
      width: element.clientWidth,
      contentWidth: element.scrollWidth,
      height: element.clientHeight,
      contentHeight: element.scrollHeight,
    }));
    assert.ok(layout.contentWidth <= layout.width, JSON.stringify(layout));
    assert.ok(layout.contentHeight > layout.height, JSON.stringify(layout));
    for (const button of await f.page
      .locator(".mobile-price--featured .price__actions .btn")
      .all()) {
      const box = await button.boundingBox();
      assert.ok(box && box.height >= 48);
    }
    await f.page
      .getByRole("button", { name: "Segnala un problema con il bar", exact: true })
      .scrollIntoViewIfNeeded();
    assert.equal(
      await f.page
        .getByRole("button", { name: "Segnala un problema con il bar", exact: true })
        .isVisible(),
      true,
    );
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("quick seen price and venue-drink-price navigation retain real callbacks", async () => {
  const f = await fixture();
  try {
    await f.page.evaluate(() => window.sheetFixture.price());
    await f.page.getByRole("switch", { name: "Happy hour" }).click();
    await f.page.getByRole("button", { name: /6,00 €/ }).click();
    assert.deepEqual(
      await f.page.evaluate(() => window.sheetFixture.calls.filter((call) => call.kind === "save")),
      [{ kind: "save", venue: "n123", drink: "spritz", hh: 1, cents: 600 }],
    );
    await f.page.evaluate(() => window.sheetFixture.price(null));
    await f.page.getByRole("button", { name: /Locale di prova <strong>/ }).click();
    await f.page.getByRole("button", { name: "Spritz", exact: true }).click();
    assert.equal(await f.page.locator(".mobile-price-form .context-tag").innerText(), "Spritz");
    await f.page.getByRole("button", { name: "Indietro", exact: true }).click();
    assert.equal(
      await f.page.getByRole("button", { name: "Birra media", exact: true }).isVisible(),
      true,
    );
    await f.page.getByRole("button", { name: "Indietro", exact: true }).click();
    await f.page.getByRole("button", { name: "Non trovi il bar?", exact: true }).click();
    assert.equal(
      await f.page.evaluate(() =>
        window.sheetFixture.calls.some((call) => call.kind === "propose"),
      ),
      true,
    );
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});
