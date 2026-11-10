import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdirSync, mkdtempSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { after, before, test } from "node:test";
import { build } from "vite";
import preact from "@preact/preset-vite";
import { chromium } from "@playwright/test";
/* global window, document, getComputedStyle */

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
            return 'export const drinkImage = (code, presentation = "scene") => code === "spritz" ? (presentation === "product" ? "/fixture-product.jpg" : "/fixture-drink.jpg") : undefined;';
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
async function fixture(options = {}) {
  let menuFailures = options.menuFailOnce ? 1 : 0;
  let menuPageFailures = options.menuPageFailOnce ? 1 : 0;
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const writes = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/mobile/v2/customer-prices" && request.method() === "POST") {
      const submitted = request.postDataJSON();
      writes.push(submitted);
      return route.fulfill({
        status: submitted.kind === "new_drink" ? 202 : 201,
        json: {
          status: submitted.kind === "new_drink" ? "pending" : "active",
          revision: "11111111-1111-4111-8111-111111111111",
          source_kind: "customer",
        },
      });
    }
    if (pathname.startsWith("/api/mobile/v2/drink-votes/venues/") && request.method() === "POST") {
      const body = request.postDataJSON();
      options.votePosts?.push(body);
      const key = pathname.slice("/api/mobile/v2/drink-votes/venues/".length);
      if (options.holdVotePostKey === key) {
        options.votePostHeld?.();
        await new Promise((resolve) => {
          options.releaseVotePost = resolve;
        });
      }
      return route.fulfill({
        json: {
          target: body.target,
          count: body.recommended ? 4 : 3,
          recommended: body.recommended,
        },
      });
    }
    if (request.method() !== "GET") {
      writes.push(request.method());
      return route.abort();
    }
    if (pathname.startsWith("/api/mobile/v2/drink-votes/venues/")) {
      const key = pathname.slice("/api/mobile/v2/drink-votes/venues/".length);
      options.voteGets?.push(key);
      if (options.voteUnavailable) return route.fulfill({ status: 503, body: "Unavailable" });
      return route.fulfill({
        json: {
          schema_version: 1,
          venue: { key, cell: "u0nd9", name: "Locale di prova" },
          items: options.voteItemsByKey?.[key] ?? options.voteItems ?? [],
        },
      });
    }
    if (pathname === "/" || pathname === "/mobile/")
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
    if (pathname === "/fixture-drink.jpg")
      return route.fulfill({
        contentType: "image/jpeg",
        body: readFileSync(path.join(root, "mobile-apps/web/assets/drinks/spritz-scene.jpg")),
      });
    if (pathname === "/fixture-product.jpg")
      return route.fulfill({
        contentType: "image/jpeg",
        body: readFileSync(path.join(root, "mobile-apps/web/assets/drinks/spritz.jpg")),
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
    if (pathname.startsWith("/api/mobile/v2/customer-prices/venues/")) {
      if (options.customerAbsent) return route.fulfill({ status: 404, body: "Not found" });
      const key = pathname.slice("/api/mobile/v2/customer-prices/venues/".length);
      return route.fulfill({
        json: {
          schema_version: 1,
          venue: {
            key,
            cell: "u0nd9",
            name: key.startsWith("m") ? "Locale nuovo" : "Locale di prova <strong>",
            country: "IT",
          },
          price_scope: "customer_reported_drink_item",
          rows: options.customerEmpty
            ? []
            : [
                {
                  revision: "22222222-2222-4222-8222-222222222222",
                  item_key: "o" + "a".repeat(64),
                  kind: "menu_offer",
                  offer_id: "first",
                  name: "Spritz <script>",
                  category: "spritz",
                  serving: { label: "Calice", ml: null },
                  amount_minor: 650,
                  currency: "EUR",
                  currency_exponent: 2,
                  observed_on: "2026-11-02",
                  source_kind: "customer",
                  observation_kind: "customer_reported_price",
                  price_scope: "drink_item",
                },
                ...(options.customerNewDrink
                  ? [
                      {
                        revision: "33333333-3333-4333-8333-333333333333",
                        item_key: "c" + "b".repeat(64),
                        kind: "new_drink",
                        offer_id: null,
                        name: "Negroni segnalato",
                        category: "negroni",
                        serving: { label: "Bicchiere", ml: null },
                        amount_minor: 900,
                        currency: "EUR",
                        currency_exponent: 2,
                        observed_on: "2026-11-02",
                        source_kind: "customer",
                        observation_kind: "customer_reported_price",
                        price_scope: "drink_item",
                      },
                    ]
                  : []),
              ],
          next_after: null,
        },
      });
    }
    if (pathname.startsWith("/api/mobile/v2/menu/venues/")) {
      if (options.menuHang)
        return new Promise(() => {
          // Deliberately keep this intercepted request unresolved.
        });
      if (options.menuAbsent) return route.fulfill({ status: 404, body: "Not found" });
      if (menuFailures > 0) {
        menuFailures--;
        return route.fulfill({ status: 503, body: "Try again" });
      }
      const key = pathname.slice("/api/mobile/v2/menu/venues/".length);
      const owner = key.startsWith("m");
      const source = {
        id: "source-1",
        url: "https://example.com/menu",
        text_sha256: "a".repeat(64),
        checked_on: "2026-11-02",
      };
      const offer = (id, name, amount, context = { kind: "regular", condition: null }) => ({
        id,
        name,
        category: options.menuCategory === undefined ? "spritz" : options.menuCategory,
        serving: { label: "Calice", ml: null },
        amount_minor: amount,
        currency: options.menuCurrency ?? "EUR",
        currency_exponent: 2,
        context,
        source,
      });
      const after = new URL(request.url()).searchParams.get("after");
      if (after && menuPageFailures > 0) {
        menuPageFailures--;
        return route.fulfill({ status: 503, body: "Try again" });
      }
      return route.fulfill({
        json: {
          schema_version: 2,
          coverage: { complete: false, basis: "verified_source_items_only" },
          price_scope: "menu_item_only",
          venue: {
            key,
            cell: "u0nd9",
            name: owner ? "Locale nuovo" : "Locale di prova <strong>",
            kind: owner ? 0 : 1,
            lat: 45.4642,
            lon: 9.19,
            address: "Via di prova 1",
            city: "Milano",
            country: options.menuCountry ?? "IT",
          },
          stored_offer_count: options.menuEmpty ? 0 : options.largeMenu ? 10 : 3,
          offers: options.menuEmpty
            ? []
            : after
              ? [offer("third", "Analcolico", 450)]
              : [
                  offer(
                    "first",
                    options.menuCategory === null ? "Cocktail della casa" : "Spritz <script>",
                    750,
                  ),
                  offer(
                    "second",
                    options.menuCategory === null ? "Cocktail serale" : "Spritz serale",
                    550,
                    {
                      kind: "conditional",
                      condition: "dopo le 18",
                    },
                  ),
                  ...(options.largeMenu
                    ? Array.from({ length: 8 }, (_, index) =>
                        offer(
                          `extra-${String(index + 1)}`,
                          `Cocktail ${String(index + 1)}`,
                          600 + index * 25,
                        ),
                      )
                    : []),
                ],
          next_after: options.menuEmpty || after || options.largeMenu ? null : "second",
          fees: options.menuEmpty
            ? []
            : [
                {
                  id: "fee-1",
                  label: "Coperto",
                  kind: "fixed",
                  basis: "person",
                  amount_minor: 100,
                  currency: "EUR",
                  currency_exponent: 2,
                  rate_bps: null,
                  applicability: "conditional",
                  condition: "solo al tavolo",
                  source,
                },
              ],
          fee_coverage: { status: "documented_partial", source },
        },
      });
    }
    if (pathname.startsWith("/api/venues/"))
      return route.fulfill({ json: { p: priceRows, h: [] } });
    return route.abort();
  });
  await page.goto(options.url ?? "https://sheets.fixture.test/");
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
    assert.equal(await f.page.locator('[data-dovebevo-share="1"]').count(), 1);
    const share = await primary.evaluate((element) => ({ ...element.dataset }));
    assert.equal(share.version, "1");
    assert.equal(share.venue, "n123");
    assert.equal(share.venueName, "Locale di prova <strong>");
    assert.equal(share.drink, "spritz");
    assert.equal(share.amountMinor, "600");
    assert.equal(share.currency, "EUR");
    assert.equal(share.serving, "");
    assert.equal(share.hh, "0");
    assert.equal(share.tier, "neutro");
    assert.equal(share.confirmations, "2");
    assert.match(share.provenance, /^Data del prezzo:/);
    await primary.getByRole("button", { name: "Confermo", exact: true }).dblclick();
    await primary.getByRole("button", { name: "Confermato", exact: true }).waitFor();
    assert.equal(await primary.getAttribute("data-confirmations"), "3");
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
    await f.page.setViewportSize({ width: 320, height: 568 });
    const priceLayout = await f.page
      .locator(".sheet__body")
      .evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }));
    assert.ok(priceLayout.scroll <= priceLayout.width + 1, JSON.stringify(priceLayout));
    const submit = f.page.locator('.mobile-price-form button[type="submit"]');
    await submit.scrollIntoViewIfNeeded();
    assert.ok((await submit.boundingBox())?.height >= 48);
    await f.page.setViewportSize({ width: 393, height: 700 });
    await f.page.getByRole("textbox", { name: "Prezzo" }).fill("5,50");
    assert.equal(await submit.isEnabled(), true);
    mkdirSync(path.join(here, "../../test-results"), { recursive: true });
    await f.page.screenshot({
      path: path.join(here, "../../test-results", "add-price-393-fixture.png"),
    });
    await f.page.getByRole("switch", { name: "Happy hour" }).click();
    await f.page.getByRole("button", { name: /6,00 €/ }).click();
    assert.deepEqual(
      await f.page.evaluate(() => window.sheetFixture.calls.filter((call) => call.kind === "save")),
      [{ kind: "save", venue: "n123", drink: "spritz", hh: 1, cents: 600 }],
    );
    await f.page.evaluate(() => window.sheetFixture.price(null));
    await f.page.getByRole("button", { name: /Locale di prova <strong>/ }).click();
    const drinkSelector = f.page.getByRole("combobox", { name: "Che cosa hai preso?" });
    assert.equal(await drinkSelector.locator("option").count(), 10);
    assert.equal(await f.page.locator(".mobile-price-flow .drinks").count(), 0);
    await drinkSelector.selectOption("spritz");
    assert.equal(await f.page.locator(".mobile-price-form .context-tag").innerText(), "Spritz");
    await f.page.getByRole("button", { name: "Indietro", exact: true }).click();
    assert.equal(await drinkSelector.isVisible(), true);
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

test("mobile venue privacy uses the approved app policy and preserves translated rules links", async () => {
  const f = await fixture();
  try {
    for (const [language, label, rules] of [
      ["it", "Informazioni", "Regole"],
      ["en", "Information", "Rules"],
    ]) {
      await f.page.evaluate(async (value) => {
        await window.sheetFixture.setLang(value);
        window.sheetFixture.bar();
      }, language);
      const links = f.page.getByRole("navigation", { name: label, exact: true });
      await links.waitFor();
      assert.equal(await links.getByRole("link").count(), 2);
      assert.equal(
        await links.getByRole("link", { name: "Privacy", exact: true }).getAttribute("href"),
        "https://github.com/robertovalerirv-beep/dove-bevo/blob/main/mobile-apps/privacy.md",
      );
      assert.equal(
        await links.getByRole("link", { name: rules, exact: true }).getAttribute("href"),
        "/regole",
      );
    }
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

async function assertActionRow(actions, count = 3) {
  const boxes = await actions.evaluateAll((buttons) =>
    buttons.map((button) => {
      const r = button.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        scroll: button.scrollWidth,
        client: button.clientWidth,
      };
    }),
  );
  assert.equal(boxes.length, count);
  assert.ok(
    boxes.every((b) => Math.abs(b.y - boxes[0].y) < 1),
    JSON.stringify(boxes),
  );
  assert.ok(
    boxes.every((b) => b.width >= 48 && b.height >= 48 && b.scroll <= b.client + 1),
    JSON.stringify(boxes),
  );
}

test("three price actions retain a phone row across languages and confirmation states", async () => {
  mkdirSync(path.join(here, "../../test-results"), { recursive: true });
  const f = await fixture();
  try {
    await f.page.evaluate(() => window.sheetFixture.bar());
    await f.page.locator("h2.scontrino__name").waitFor();
    const actions = f.page.locator(".mobile-price--featured .price__actions .btn");
    for (const width of [393, 320]) {
      await f.page.setViewportSize({ width, height: 700 });
      await assertActionRow(actions);
      await f.page.screenshot({
        path: path.join(here, "../../test-results", `price-actions-${width}-fixture.png`),
      });
    }
    await f.page.evaluate(() => window.sheetFixture.setConfirmation("hold"));
    await actions.first().click();
    await f.page.waitForFunction(
      () =>
        document
          .querySelector(".mobile-price--featured .price__actions button")
          ?.getAttribute("aria-disabled") === "true",
    );
    await assertActionRow(actions);
    await f.page.evaluate(() => window.sheetFixture.finishConfirmation());
    await f.page.getByRole("button", { name: "Confermato", exact: true }).waitFor();
    await assertActionRow(actions);
    assert.equal(await actions.first().getAttribute("aria-disabled"), "true");
    await f.page.evaluate(() => {
      window.sheetFixture.setConfirmation("failed");
      window.sheetFixture.bar(["gin_tonic"]);
    });
    await actions.first().click();
    await f.page.getByRole("alert").waitFor();
    await assertActionRow(actions);
    assert.equal(await actions.first().getAttribute("aria-disabled"), null);
    await f.page.evaluate(async () => {
      await window.sheetFixture.setLang("en");
      window.sheetFixture.bar(["gin_tonic"]);
    });
    await f.page.getByRole("button", { name: "Report an error", exact: true }).first().waitFor();
    for (const width of [393, 320]) {
      await f.page.setViewportSize({ width, height: 700 });
      await assertActionRow(actions);
    }
    const review = f.page.locator("li.mobile-price").filter({ hasText: "Medium beer" });
    await review.getByRole("button", { name: "Price actions", exact: false }).click();
    await assertActionRow(review.locator(".price__actions .btn"), 2);
    assert.equal(await review.getByRole("button", { name: "It changed", exact: true }).count(), 0);
    await f.page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    const large = await actions.evaluateAll((buttons) =>
      buttons.map((button) => {
        const r = button.getBoundingClientRect();
        return {
          y: r.y,
          width: r.width,
          height: r.height,
          font: Number.parseFloat(getComputedStyle(button).fontSize),
          scroll: button.scrollWidth,
          client: button.clientWidth,
        };
      }),
    );
    assert.ok(
      large.every(
        (b) => b.font >= 26 && b.width >= 48 && b.height >= 48 && b.scroll <= b.client + 1,
      ),
      JSON.stringify(large),
    );
    assert.ok(large[2].y > large[0].y, "Large text reflows instead of shrinking to force one row");
    const body = await f.page
      .locator(".sheet__body")
      .evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }));
    assert.ok(body.scroll <= body.width + 1, JSON.stringify(body));
    await actions.last().scrollIntoViewIfNeeded();
    assert.ok(await actions.last().isVisible());
    await f.page.screenshot({
      path: path.join(here, "../../test-results", "price-actions-large-text-fixture.png"),
    });
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("saved legacy drink opens the exact price and band without creating a contribution", async () => {
  const f = await fixture({
    url: "https://sheets.fixture.test/mobile/?path=%2Fbar%2Fn123&c=u0nd9&drink=gin_tonic&hh=0",
  });
  try {
    await f.page.evaluate(() => window.sheetFixture.bar());
    await f.page.getByRole("heading", { name: "Locale di prova <strong>" }).waitFor();
    assert.match(await f.page.locator(".mobile-price--featured").innerText(), /8,00 €/);
    assert.equal(await f.page.getByTestId("saved-drink-unavailable").count(), 0);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("missing saved happy-hour price is explicit and never features a different band", async () => {
  const f = await fixture({
    url: "https://sheets.fixture.test/mobile/?path=%2Fbar%2Fn123&c=u0nd9&drink=spritz&hh=1",
  });
  try {
    await f.page.evaluate(() => window.sheetFixture.bar());
    await f.page.getByTestId("saved-drink-unavailable").waitFor();
    assert.equal(await f.page.locator(".mobile-price--featured").count(), 0);
    assert.equal(await f.page.getByTestId("saved-menu-offer").count(), 0);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("saved owner menu drink matches regular context but never conditional or another band", async () => {
  const key = "maaaaaaaaaaaaaaaaaaaaaaaa";
  const regular = await fixture({
    url: `https://sheets.fixture.test/mobile/?path=%2Fbar%2F${key}&c=u0nd9&drink=spritz&hh=0`,
  });
  try {
    await regular.page.evaluate((venueKey) => window.sheetFixture.bar([], venueKey), key);
    const saved = regular.page.getByTestId("saved-menu-offer");
    await saved.waitFor();
    assert.match(await saved.innerText(), /Spritz <script>[\s\S]*7,50\s*€/);
    assert.equal(await regular.page.getByTestId("saved-drink-unavailable").count(), 0);
    assert.deepEqual(regular.writes, []);
  } finally {
    await regular.close();
  }
  const happy = await fixture({
    url: `https://sheets.fixture.test/mobile/?path=%2Fbar%2F${key}&c=u0nd9&drink=spritz&hh=1`,
  });
  try {
    await happy.page.evaluate((venueKey) => window.sheetFixture.bar([], venueKey), key);
    await happy.page.getByTestId("saved-drink-unavailable").waitFor();
    assert.equal(await happy.page.getByTestId("saved-menu-offer").count(), 0);
    assert.deepEqual(happy.writes, []);
  } finally {
    await happy.close();
  }
});

test("exact named favorite reloads its menu page and native save link uses only the live offer id", async () => {
  const key = "maaaaaaaaaaaaaaaaaaaaaaaa";
  const f = await fixture({
    url: `https://sheets.fixture.test/mobile/?path=%2Fbar%2F${key}&c=u0nd9&offer=third`,
  });
  try {
    await f.page.evaluate((venueKey) => window.sheetFixture.bar([], venueKey), key);
    const saved = f.page.getByTestId("saved-exact-offer");
    await saved.waitFor();
    assert.match(await saved.innerText(), /Analcolico[\s\S]*Questo drink è nei tuoi preferiti/);
    assert.equal(await f.page.getByTestId("saved-offer-unavailable").count(), 0);
    assert.equal(await f.page.getByTestId("saved-menu-offer").count(), 0);
    assert.equal(await f.page.locator(".mobile-menu-v2__save").count(), 0);
    await f.page.evaluate(() => {
      window.DoveBevoNativeOfferSave = true;
      window.dispatchEvent(new window.Event("dovebevo-native-ready"));
    });
    const links = f.page.locator(".mobile-menu-v2__save");
    await links.first().waitFor();
    assert.equal(await links.count(), 4);
    assert.equal(
      await saved.locator(".mobile-menu-v2__save").getAttribute("href"),
      `/mobile/?path=%2Fbar%2F${key}&c=u0nd9&save_offer=third`,
    );
    assert.equal(
      await f.page
        .getByTestId("featured-menu-price")
        .locator(".mobile-menu-v2__save")
        .getAttribute("href"),
      `/mobile/?path=%2Fbar%2F${key}&c=u0nd9&save_offer=third`,
    );
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("exact private saves and one public vote read identify each visible drink", async () => {
  const voteGets = [];
  const f = await fixture({
    customerNewDrink: true,
    voteGets,
    voteItems: [
      { target: { kind: "legacy", drink: "spritz", band: "normal" }, count: 3, recommended: true },
      { target: { kind: "offer", id: "first" }, count: 5, recommended: false },
      { target: { kind: "customer", id: `c${"b".repeat(64)}` }, count: 2, recommended: false },
    ],
  });
  try {
    await f.page.evaluate(() => window.sheetFixture.bar());
    const legacy = f.page.locator(".mobile-price--featured");
    await legacy.waitFor();
    assert.equal(await legacy.locator(".mobile-menu-v2__save").count(), 0);
    assert.equal(
      await f.page.locator(".mobile-customer-v2__quick-actions .mobile-menu-v2__save").count(),
      0,
    );
    await f.page.evaluate(() => {
      window.DoveBevoNativeDrinkSave = true;
      window.DoveBevoNativeCustomerSave = true;
      window.dispatchEvent(new window.Event("dovebevo-native-ready"));
    });
    const legacyActions = legacy.locator(".mobile-price__quick-actions");
    await legacyActions.waitFor();
    await legacyActions.locator(".mobile-drink-vote[data-voted='true']").waitFor();
    assert.equal(
      await legacyActions.locator(".mobile-menu-v2__save").getAttribute("href"),
      "/mobile/?path=%2Fbar%2Fn123&c=u0nd9&save_drink=spritz&band=normal",
    );
    assert.equal(
      await legacyActions.locator(".mobile-drink-vote").getAttribute("aria-pressed"),
      "true",
    );
    assert.match(await legacyActions.locator(".mobile-drink-vote").innerText(), /3/);
    const offer = f.page
      .locator(".mobile-menu-v2__offer")
      .filter({ hasText: "Spritz <script>" })
      .first();
    await offer.locator(".mobile-drink-vote").getByText("5").waitFor();
    assert.match(await offer.locator(".mobile-drink-vote").innerText(), /5/);
    const customer = f.page.locator(".mobile-customer-v2__observation").first();
    await customer.locator(".mobile-menu-v2__save").waitFor();
    assert.equal(
      await customer.locator(".mobile-menu-v2__save").getAttribute("href"),
      `/mobile/?path=%2Fbar%2Fn123&c=u0nd9&save_customer=o${"a".repeat(64)}`,
    );
    const additional = f.page.locator(".mobile-customer-v2__additional > li");
    await additional.locator(".mobile-drink-vote").getByText("2").waitFor();
    assert.equal(
      await additional.locator(".mobile-menu-v2__save").getAttribute("href"),
      `/mobile/?path=%2Fbar%2Fn123&c=u0nd9&save_customer=c${"b".repeat(64)}`,
    );
    assert.match(await additional.locator(".mobile-drink-vote").innerText(), /2/);
    assert.deepEqual(voteGets, ["n123"]);
    for (const width of [320, 390]) {
      await f.page.setViewportSize({ width, height: 700 });
      for (const action of await legacyActions.locator("a, button").all())
        assert.ok((await action.boundingBox())?.height >= 44);
      const overflow = await f.page.locator(".sheet__body").evaluate((element) => ({
        width: element.clientWidth,
        scroll: element.scrollWidth,
      }));
      assert.ok(overflow.scroll <= overflow.width + 1, JSON.stringify({ width, overflow }));
    }
    if (process.env.DOVEBEVO_ACTION_CAPTURE)
      await f.page.screenshot({ path: process.env.DOVEBEVO_ACTION_CAPTURE });
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("uncategorized named menu drink has its own exact thumb and private save", async () => {
  const f = await fixture({ menuCategory: null, customerEmpty: true });
  try {
    await f.page.evaluate(() => window.sheetFixture.bar([], "maaaaaaaaaaaaaaaaaaaaaaaa"));
    await f.page.evaluate(() => {
      window.DoveBevoNativeOfferSave = true;
      window.dispatchEvent(new window.Event("dovebevo-native-ready"));
    });
    const offer = f.page
      .locator(".mobile-menu-v2__offer")
      .filter({ hasText: "Cocktail della casa" });
    await offer.locator(".mobile-menu-v2__save").waitFor();
    assert.equal(await offer.locator(".mobile-drink-vote").count(), 1);
    assert.equal(await offer.locator(".mobile-drink-vote").getAttribute("aria-pressed"), "false");
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("a thumb tap updates only its exact legacy drink in an intercepted local fixture", async () => {
  const votePosts = [];
  const f = await fixture({
    votePosts,
    voteItems: [
      { target: { kind: "legacy", drink: "spritz", band: "normal" }, count: 3, recommended: false },
    ],
  });
  try {
    await f.page.evaluate(() => window.sheetFixture.bar());
    const thumb = f.page.locator(".mobile-price--featured .mobile-drink-vote");
    await thumb.getByText("3").waitFor();
    assert.equal(await thumb.getAttribute("aria-pressed"), "false");
    await thumb.click();
    await thumb.getByText("4").waitFor();
    assert.equal(await thumb.getAttribute("aria-pressed"), "true");
    assert.deepEqual(votePosts, [
      { target: { kind: "legacy", drink: "spritz", band: "normal" }, recommended: true },
    ]);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("late vote response from a closed venue cannot change another venue's thumb", async () => {
  const otherKey = "maaaaaaaaaaaaaaaaaaaaaaaa";
  let votePostHeld;
  const held = new Promise((resolve) => {
    votePostHeld = resolve;
  });
  const options = {
    holdVotePostKey: "n123",
    votePostHeld,
    voteItemsByKey: {
      n123: [
        {
          target: { kind: "legacy", drink: "spritz", band: "normal" },
          count: 3,
          recommended: false,
        },
      ],
      [otherKey]: [{ target: { kind: "offer", id: "first" }, count: 7, recommended: false }],
    },
  };
  const f = await fixture(options);
  try {
    await f.page.evaluate(() => window.sheetFixture.bar());
    const firstThumb = f.page.locator(".mobile-price--featured .mobile-drink-vote");
    await firstThumb.getByText("3").waitFor();
    await firstThumb.click();
    await held;
    await f.page.evaluate((key) => window.sheetFixture.bar([], key), otherKey);
    const otherThumb = f.page.locator(".mobile-menu-v2__offer .mobile-drink-vote").first();
    await otherThumb.getByText("7").waitFor();
    const response = f.page.waitForResponse(
      (value) =>
        value.url().includes("/drink-votes/venues/n123") && value.request().method() === "POST",
    );
    options.releaseVotePost();
    await response;
    assert.equal(await otherThumb.getAttribute("aria-pressed"), "false");
    assert.match(await otherThumb.innerText(), /7/);
    assert.deepEqual(f.writes, []);
  } finally {
    options.releaseVotePost?.();
    await f.close();
  }
});

test("retired exact named favorite shows unavailable without featuring another offer", async () => {
  const key = "maaaaaaaaaaaaaaaaaaaaaaaa";
  const f = await fixture({
    url: `https://sheets.fixture.test/mobile/?path=%2Fbar%2F${key}&c=u0nd9&offer=retired`,
  });
  try {
    await f.page.evaluate((venueKey) => window.sheetFixture.bar([], venueKey), key);
    await f.page.getByTestId("saved-offer-unavailable").waitFor();
    assert.equal(await f.page.getByTestId("saved-exact-offer").count(), 0);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("source-backed drink menu keeps original item, condition, fee and page boundary visible", async () => {
  const f = await fixture();
  try {
    await f.page.evaluate(() => window.sheetFixture.bar());
    const menu = f.page.getByRole("region", { name: "Prezzi dal menu online" });
    await menu.getByText("Spritz <script>").waitFor();
    assert.equal(await menu.locator("script").count(), 0);
    assert.match(await menu.innerText(), /7,50\s€[\s\S]*Solo con: dopo le 18/);
    assert.match(await menu.innerText(), /Coperto[\s\S]*1,00\s€ a persona[\s\S]*solo al tavolo/);
    assert.match(
      await menu.innerText(),
      /prezzi del drink indicati nel menu, non il totale pagato/i,
    );
    assert.match(await menu.innerText(), /potrebbero essercene altri/);
    assert.equal(await menu.getByText("Analcolico").count(), 0);
    await menu.getByRole("button", { name: "Vedi altri drink" }).click();
    await menu.getByText("Analcolico").waitFor();
    assert.equal(await menu.locator(".mobile-menu-v2__offer").count(), 3);
    assert.equal(await menu.getByRole("button", { name: "Vedi altri drink" }).count(), 0);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("long owner menus keep the saved drink prominent and reveal sourced secondary prices on demand", async () => {
  const key = "maaaaaaaaaaaaaaaaaaaaaaaa";
  const f = await fixture({
    largeMenu: true,
    customerEmpty: true,
    url: `https://sheets.fixture.test/mobile/?path=%2Fbar%2F${key}&c=u0nd9&offer=extra-8`,
  });
  try {
    await f.page.evaluate((venueKey) => window.sheetFixture.bar([], venueKey), key);
    await f.page.evaluate(() => {
      window.DoveBevoNativeOfferSave = true;
      window.dispatchEvent(new window.Event("dovebevo-native-ready"));
    });
    const menu = f.page.getByRole("region", { name: "Prezzi dal menu online" });
    const saved = menu.getByTestId("saved-exact-offer");
    await saved.waitFor();
    assert.match(await saved.innerText(), /Cocktail 8[\s\S]*Questo drink è nei tuoi preferiti/);
    assert.equal(await menu.locator(".mobile-menu-v2__offer").count(), 10);
    const more = menu.locator(".mobile-menu-v2__more-offers");
    assert.equal(await more.getAttribute("open"), null);
    assert.equal(await more.getByText("Altri prezzi dal menu").isVisible(), true);
    await more.locator(":scope > summary").click();
    const rows = more.locator(".mobile-menu-v2__offers--compact");
    assert.equal(await rows.evaluate((element) => getComputedStyle(element).overflowY), "visible");
    const conditional = rows.locator(".mobile-menu-v2__offer").filter({ hasText: "Spritz serale" });
    const save = conditional.locator(".mobile-menu-v2__save");
    assert.equal(await save.isVisible(), true);
    assert.equal(
      await save.getAttribute("href"),
      `/mobile/?path=%2Fbar%2F${key}&c=u0nd9&save_offer=second`,
    );
    assert.equal(
      await conditional.locator(".mobile-menu-v2__offer-details").getAttribute("open"),
      null,
    );
    assert.match(
      await conditional.locator("summary").innerText(),
      /5,50\s*€[\s\S]*Solo con: dopo le 18/,
    );
    assert.equal(await conditional.getByRole("link", { name: /Menu verificato il/ }).count(), 0);
    await conditional.locator("summary").click();
    assert.equal(
      await conditional.getByRole("link", { name: /Menu verificato il/ }).isVisible(),
      true,
    );
    assert.equal(
      await conditional.getByRole("button", { name: "Prezzo diverso? Aggiorna" }).isVisible(),
      true,
    );
    if (process.env.DOVEBEVO_COMPACT_CAPTURE)
      await f.page.screenshot({ path: process.env.DOVEBEVO_COMPACT_CAPTURE });
    assert.match(await menu.innerText(), /Coperto[\s\S]*1,00\s*€ a persona/);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("compact menu rows keep details and lower sheet content reachable at phone widths", async () => {
  const f = await fixture({
    largeMenu: true,
    customerEmpty: true,
    viewport: { width: 320, height: 700 },
  });
  try {
    await f.page.evaluate(() => window.sheetFixture.bar([], "maaaaaaaaaaaaaaaaaaaaaaaa"));
    const menu = f.page.getByRole("region", { name: "Prezzi dal menu online" });
    const more = menu.locator(".mobile-menu-v2__more-offers");
    await more.locator(":scope > summary").click();
    const rows = more.locator(".mobile-menu-v2__offers--compact");
    const row = rows
      .locator(".mobile-menu-v2__offer--compact")
      .filter({ hasText: "Spritz serale" });
    const fee = menu.getByText("Coperto", { exact: true });
    const customerAction = f.page.getByRole("button", { name: "Aggiungi un drink mancante" });
    for (const width of [390, 320]) {
      await f.page.setViewportSize({ width, height: 700 });
      await f.page.locator(".sheet__body").evaluate((element) => {
        element.scrollTop = 0;
      });
      const layout = await rows.evaluate((element) => ({
        overflowY: getComputedStyle(element).overflowY,
        ownHeight: element.clientHeight,
        contentHeight: element.scrollHeight,
        right: element.getBoundingClientRect().right,
        viewportWidth: window.innerWidth,
      }));
      assert.equal(layout.overflowY, "visible");
      assert.ok(layout.contentHeight <= layout.ownHeight + 1, JSON.stringify(layout));
      assert.ok(layout.right <= layout.viewportWidth, JSON.stringify(layout));
      assert.match(
        await row.locator("summary").innerText(),
        /Spritz serale[\s\S]*5,50\s*€[\s\S]*Solo con: dopo le 18/,
      );
      await fee.scrollIntoViewIfNeeded();
      await customerAction.scrollIntoViewIfNeeded();
      const reach = await customerAction.evaluate((element) => {
        const sheet = element.closest(".sheet__body");
        const actionRect = element.getBoundingClientRect();
        const sheetRect = sheet.getBoundingClientRect();
        return {
          scrollTop: sheet.scrollTop,
          top: actionRect.top,
          bottom: actionRect.bottom,
          visibleTop: sheetRect.top,
          visibleBottom: sheetRect.bottom,
        };
      });
      assert.ok(reach.scrollTop > 0, JSON.stringify(reach));
      assert.ok(
        reach.top >= reach.visibleTop && reach.bottom <= reach.visibleBottom,
        JSON.stringify(reach),
      );
    }
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("uncategorized sourced drinks use neutral venue art and menu prices do not look like deals", async () => {
  const f = await fixture({ menuCategory: null });
  try {
    await f.page.evaluate(() => window.sheetFixture.bar([], "maaaaaaaaaaaaaaaaaaaaaaaa"));
    await f.page.getByText("Cocktail della casa").waitFor();
    const hero = f.page.locator(".mobile-venue__hero--neutral");
    await hero.waitFor();
    assert.equal(await hero.locator('img[src="/brand/simbolo.svg"]').count(), 1);
    assert.equal(await f.page.locator(".mobile-venue__hero figcaption").count(), 0);
    const first = f.page.locator(".mobile-menu-v2__offer").first();
    assert.match(
      await first.innerText(),
      /Cocktail della casa[\s\S]*Prezzo da menu[\s\S]*7,50\s*€/,
    );
    assert.equal(
      await first
        .locator(".mobile-menu-v2__amount")
        .evaluate((element) => getComputedStyle(element).color),
      "rgb(27, 22, 17)",
    );
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});
test("owner-verified venue separates cited menu and customer price, and submits an update to the fixture only", async () => {
  const f = await fixture();
  try {
    await f.page.evaluate(() => window.sheetFixture.bar([], "maaaaaaaaaaaaaaaaaaaaaaaa"));
    await f.page.getByRole("heading", { name: "Locale nuovo" }).waitFor();
    assert.equal(await f.page.getByRole("button", { name: "Aggiungi un prezzo qui" }).count(), 0);
    const owner = f.page.locator(".mobile-menu-v2__offer").first();
    await owner.getByText("Prezzo segnalato da un cliente").waitFor();
    assert.match(await owner.innerText(), /7,50\s€[\s\S]*6,50\s€/);
    assert.match(await owner.innerText(), /Menu verificato il 2026-11-02/);
    await owner.getByRole("button", { name: "Prezzo diverso? Aggiorna" }).click();
    await owner.getByLabel("Importo pagato (EUR)").fill("8,20");
    await owner.getByRole("button", { name: "Condividi prezzo" }).click();
    await f.page.getByText("Prezzo salvato e visibile a tutti.").waitFor();
    assert.deepEqual(f.writes, [
      {
        kind: "menu_offer",
        venue_key: "maaaaaaaaaaaaaaaaaaaaaaaa",
        cell: "u0nd9",
        offer_id: "first",
        amount_minor: 820,
        currency: "EUR",
        currency_exponent: 2,
        expected_revision: "22222222-2222-4222-8222-222222222222",
      },
    ]);
    const support = f.page.getByRole("link", { name: "Segnala un problema con il locale" });
    assert.match(await support.getAttribute("href"), /^mailto:dovebevo@gmail\.com\?/);
  } finally {
    await f.close();
  }
});

test("menu price editor shows the real venue and serving, a large amount, and cancels without a public write", async () => {
  const f = await fixture({ customerEmpty: true });
  try {
    await f.page.evaluate(() => window.sheetFixture.bar([], "maaaaaaaaaaaaaaaaaaaaaaaa"));
    const owner = f.page.locator(".mobile-menu-v2__offer").first();
    await owner.getByRole("button", { name: "Prezzo diverso? Aggiorna" }).click();
    const form = owner.locator(".mobile-customer-v2__form--menu");
    await form.waitFor();
    assert.equal(
      await form.locator(".mobile-customer-v2__form-heading strong").innerText(),
      "Locale nuovo",
    );
    assert.equal(await form.locator(".mobile-customer-v2__form-art img").count(), 1);
    assert.match(
      await form.innerText(),
      /Spritz <script>[\s\S]*Calice[\s\S]*Prezzo da menu: 7,50\s*€/,
    );
    const amount = form.getByLabel("Importo pagato (EUR)");
    assert.equal(await amount.getAttribute("inputmode"), "decimal");
    assert.equal(await form.locator(".mobile-customer-v2__amount-input > span").innerText(), "€");
    const geometry = await form.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      right: element.getBoundingClientRect().right,
      viewport: window.innerWidth,
      amountFont: getComputedStyle(element.querySelector(".mobile-customer-v2__amount-input input"))
        .fontSize,
    }));
    assert.ok(geometry.width > 240);
    assert.ok(geometry.right <= geometry.viewport);
    assert.equal(geometry.amountFont, "29px");
    await amount.fill("8,20");
    await form.locator(".mobile-customer-v2__form-art img").evaluate((image) => image.decode());
    assert.deepEqual(f.writes, []);
    await form.getByRole("button", { name: "Annulla" }).click();
    assert.equal(await owner.locator(".mobile-customer-v2__form").count(), 0);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("menu price editor keeps original GBP currency in display and customer submission", async () => {
  const f = await fixture({ customerEmpty: true, menuCurrency: "GBP", menuCountry: "GB" });
  try {
    await f.page.evaluate(async () => {
      await window.sheetFixture.setLang("en");
      window.sheetFixture.bar([], "maaaaaaaaaaaaaaaaaaaaaaaa");
    });
    const owner = f.page.locator(".mobile-menu-v2__offer").first();
    await owner.getByRole("button", { name: "Prezzo diverso? Aggiorna" }).click();
    const form = owner.locator(".mobile-customer-v2__form--menu");
    assert.match(await form.innerText(), /Add a price[\s\S]*Menu price:/i);
    assert.equal(await form.locator(".mobile-customer-v2__amount-input > span").innerText(), "£");
    await form.getByLabel("Price paid (GBP)").fill("8,20");
    await form.getByRole("button", { name: "Share price" }).click();
    await f.page.getByText("Prezzo salvato e visibile a tutti.").waitFor();
    assert.deepEqual(f.writes, [
      {
        kind: "menu_offer",
        venue_key: "maaaaaaaaaaaaaaaaaaaaaaaa",
        cell: "u0nd9",
        offer_id: "first",
        amount_minor: 820,
        currency: "GBP",
        currency_exponent: 2,
        expected_revision: null,
      },
    ]);
  } finally {
    await f.close();
  }
});

test("a new named drink enters moderation without changing the cited menu", async () => {
  const f = await fixture();
  try {
    await f.page.evaluate(() => window.sheetFixture.bar([], "maaaaaaaaaaaaaaaaaaaaaaaa"));
    await f.page.getByRole("button", { name: "Aggiungi un drink mancante" }).waitFor();
    await f.page.getByRole("button", { name: "Aggiungi un drink mancante" }).click();
    const form = f.page.locator(".mobile-customer-v2__form");
    await form.getByLabel("Nome del drink").fill("Negroni della casa");
    await form.getByLabel("Tipo di drink").selectOption("negroni");
    await form.getByLabel("Porzione (facoltativa)").fill("bicchiere");
    await form.getByLabel("Importo pagato (EUR)").fill("9,00");
    await form.getByRole("button", { name: "Condividi prezzo" }).click();
    await f.page.getByText("Drink inviato: sarà visibile dopo la verifica.").waitFor();
    assert.deepEqual(f.writes, [
      {
        kind: "new_drink",
        venue_key: "maaaaaaaaaaaaaaaaaaaaaaaa",
        cell: "u0nd9",
        name: "Negroni della casa",
        category: "negroni",
        serving_label: "bicchiere",
        serving_ml: null,
        amount_minor: 900,
        currency: "EUR",
        currency_exponent: 2,
        expected_revision: null,
      },
    ]);
    assert.match(await f.page.locator(".mobile-menu-v2__offer").first().innerText(), /7,50\s€/);
  } finally {
    await f.close();
  }
});
test("legacy add-price search excludes m venues while existing n venues remain selectable", async () => {
  const f = await fixture();
  try {
    await f.page.evaluate(() => window.sheetFixture.price(null, false));
    const search = f.page.locator('input[type="search"]');
    await search.fill("Locale solo app");
    assert.equal(await f.page.getByRole("button", { name: /Locale solo app/ }).count(), 0);
    await search.fill("Locale di prova");
    await f.page.getByRole("button", { name: /Locale di prova <strong>/ }).waitFor();
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});
test("legacy venue opens while v2 menu hangs, but an m venue times out to retry", async () => {
  const f = await fixture({ menuHang: true });
  try {
    const start = Date.now();
    await f.page.evaluate(() => window.sheetFixture.bar());
    await f.page.getByRole("heading", { name: "Locale di prova <strong>" }).waitFor({
      timeout: 1500,
    });
    assert.ok(Date.now() - start < 1500, "Legacy sheet must not wait for the v2 request");
    assert.match(await f.page.locator(".mobile-price--featured").innerText(), /6,00 €/);
    await f.page.evaluate(() => window.sheetFixture.bar([], "maaaaaaaaaaaaaaaaaaaaaaaa"));
    await f.page.getByRole("heading", { name: "Menu temporaneamente non disponibile" }).waitFor({
      timeout: 8000,
    });
    await f.page.getByRole("button", { name: "Riprova" }).waitFor();
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});
test("menu loading failure leaves legacy customer prices without an empty menu section", async () => {
  const f = await fixture({ menuFailOnce: true });
  try {
    await f.page.evaluate(() => window.sheetFixture.bar());
    await f.page.locator(".mobile-price--featured").waitFor();
    assert.match(await f.page.locator(".mobile-price--featured").innerText(), /6,00 €/);
    assert.equal(await f.page.getByRole("region", { name: "Prezzi dal menu online" }).count(), 0);
    assert.equal(await f.page.getByRole("button", { name: "Riprova menu" }).count(), 0);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("an empty owner menu has no owner section while customer price entry remains available", async () => {
  const f = await fixture({ menuEmpty: true });
  try {
    await f.page.evaluate(() => window.sheetFixture.bar([], "maaaaaaaaaaaaaaaaaaaaaaaa"));
    await f.page.getByRole("heading", { name: "Locale nuovo" }).waitFor();
    await f.page.getByRole("button", { name: "Aggiungi un drink mancante" }).waitFor();
    assert.equal(await f.page.getByRole("region", { name: "Prezzi dal menu online" }).count(), 0);
    assert.equal(await f.page.getByRole("heading", { name: "Prezzi", exact: true }).count(), 0);
    assert.equal(
      await f.page.getByRole("region", { name: "Prezzi segnalati dai clienti" }).count(),
      1,
    );
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("an empty menu and empty customer feed keep one contribution action without an empty card", async () => {
  const f = await fixture({ menuEmpty: true, customerEmpty: true });
  try {
    await f.page.evaluate(() => window.sheetFixture.bar());
    await f.page.locator(".mobile-price--featured").waitFor();
    const customer = f.page.getByRole("region", { name: "Prezzi segnalati dai clienti" });
    await customer.getByRole("button", { name: "Aggiungi un drink mancante" }).waitFor();
    assert.equal(await f.page.getByRole("heading", { name: "Dal menu del locale" }).count(), 0);
    assert.equal(await customer.getByRole("heading").count(), 0);
    assert.equal(await customer.getByText(/Nessun.*prezzo segnalato/).count(), 0);
    assert.equal(
      await customer.evaluate((element) => getComputedStyle(element).borderTopWidth),
      "0px",
    );
    assert.match(await f.page.locator(".mobile-price--featured").innerText(), /6,00 €/);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("a menu-only venue with no prices still exposes its own price contribution flow", async () => {
  const f = await fixture({ menuEmpty: true, customerEmpty: true });
  try {
    await f.page.evaluate(() => window.sheetFixture.bar([], "maaaaaaaaaaaaaaaaaaaaaaaa"));
    await f.page.getByRole("heading", { name: "Locale nuovo" }).waitFor();
    const customer = f.page.getByRole("region", { name: "Prezzi segnalati dai clienti" });
    await customer.getByRole("button", { name: "Aggiungi un drink mancante" }).waitFor();
    assert.equal(await f.page.getByRole("heading", { name: "Dal menu del locale" }).count(), 0);
    assert.equal(await customer.getByRole("heading").count(), 0);
    assert.equal(
      await f.page.getByText("Menu online non disponibile. Riprova tra poco.").count(),
      0,
    );
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("a linked customer price remains visible when its owner menu is unavailable", async () => {
  const f = await fixture({ menuAbsent: true });
  try {
    await f.page.evaluate(() => window.sheetFixture.bar());
    await f.page.locator(".mobile-price--featured").waitFor();
    const customer = f.page.getByRole("region", { name: "Prezzi segnalati dai clienti" });
    await customer.getByText("Spritz <script>").waitFor();
    assert.match(await customer.innerText(), /Spritz <script>[\s\S]*6,50\s*€/);
    assert.equal(await customer.getByRole("button", { name: "Segnala prezzo errato" }).count(), 1);
    assert.equal(
      await customer.getByRole("button", { name: "Prezzo diverso? Aggiorna" }).count(),
      0,
    );
    assert.equal(await f.page.getByRole("heading", { name: "Dal menu del locale" }).count(), 0);
    assert.match(await f.page.locator(".mobile-price--featured").innerText(), /6,00 €/);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("a failed extra menu page offers a compact retry without the unavailable-menu notice", async () => {
  const f = await fixture({ menuPageFailOnce: true });
  try {
    await f.page.evaluate(() => window.sheetFixture.bar([], "maaaaaaaaaaaaaaaaaaaaaaaa"));
    await f.page.getByRole("button", { name: "Vedi altri drink" }).click();
    await f.page.getByRole("button", { name: "Riprova altri drink" }).waitFor();
    assert.equal(
      await f.page.getByText("Menu online non disponibile. Riprova tra poco.").count(),
      0,
    );
    await f.page.getByRole("button", { name: "Riprova altri drink" }).click();
    await f.page.getByText("Analcolico").waitFor();
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("an existing Italian venue retains a customer drink when its owner menu is empty", async () => {
  const f = await fixture({ menuEmpty: true, customerNewDrink: true });
  try {
    await f.page.evaluate(() => window.sheetFixture.bar());
    await f.page.getByRole("heading", { name: "Locale di prova <strong>" }).waitFor();
    assert.equal(await f.page.getByRole("region", { name: "Prezzi dal menu online" }).count(), 0);
    const customer = f.page.getByRole("region", { name: "Prezzi segnalati dai clienti" });
    await customer.getByText("Negroni segnalato").waitFor();
    assert.match(await customer.innerText(), /Negroni segnalato[\s\S]*9,00\s*€/);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("an existing Italian venue retains customer drinks when its owner menu returns 404", async () => {
  const f = await fixture({ menuAbsent: true, customerNewDrink: true });
  try {
    await f.page.evaluate(() => window.sheetFixture.bar());
    await f.page.getByRole("heading", { name: "Locale di prova <strong>" }).waitFor();
    assert.equal(await f.page.getByRole("region", { name: "Prezzi dal menu online" }).count(), 0);
    const customer = f.page.getByRole("region", { name: "Prezzi segnalati dai clienti" });
    await customer.getByText("Negroni segnalato").waitFor();
    assert.match(await customer.innerText(), /Negroni segnalato[\s\S]*9,00\s*€/);
    await customer.getByRole("button", { name: "Aggiungi un drink mancante" }).waitFor();
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("missing owner and customer menus leave a real legacy price without empty headings", async () => {
  const f = await fixture({ menuAbsent: true, customerAbsent: true });
  try {
    const customerRead = f.page.waitForResponse(
      (response) =>
        response.url().includes("/api/mobile/v2/customer-prices/venues/n123") &&
        response.status() === 404,
    );
    await f.page.evaluate(() => window.sheetFixture.bar());
    await customerRead;
    await f.page.locator(".mobile-price--featured").waitFor();
    await f.page.waitForFunction(() => document.querySelector(".mobile-customer-v2") === null);
    assert.equal(await f.page.getByRole("heading", { name: "Dal menu del locale" }).count(), 0);
    assert.equal(
      await f.page.getByRole("heading", { name: "Prezzi segnalati dai clienti" }).count(),
      0,
    );
    assert.match(await f.page.locator(".mobile-price--featured").innerText(), /6,00 €/);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});

test("iPhone 16 Plus width keeps venue price actions and footer reachable by scrolling", async () => {
  const f = await fixture();
  try {
    // The embedded web viewport is shorter than the physical display after native chrome.
    await f.page.setViewportSize({ width: 430, height: 700 });
    await f.page.evaluate(() => window.sheetFixture.bar());
    const body = f.page.locator(".sheet__body");
    await f.page.locator("h2.scontrino__name").waitFor();
    const dimensions = await body.evaluate((element) => ({
      height: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollWidth: element.scrollWidth,
      width: element.clientWidth,
    }));
    assert.ok(dimensions.scrollHeight > dimensions.height, JSON.stringify(dimensions));
    assert.ok(dimensions.scrollWidth <= dimensions.width, JSON.stringify(dimensions));
    await body.hover();
    await f.page.mouse.wheel(0, 600);
    await f.page.waitForFunction(() => document.querySelector(".sheet__body")?.scrollTop > 0);
    const privacy = f.page.getByRole("link", { name: "Privacy", exact: true });
    await privacy.scrollIntoViewIfNeeded();
    const footerBox = await privacy.boundingBox();
    const bodyBox = await body.boundingBox();
    assert.ok(footerBox && bodyBox && footerBox.y + footerBox.height <= bodyBox.y + bodyBox.height);
    const addPrice = f.page.getByRole("button", { name: "Aggiungi un prezzo qui", exact: true });
    await addPrice.scrollIntoViewIfNeeded();
    const priceBox = await addPrice.boundingBox();
    assert.ok(priceBox && bodyBox && priceBox.y + priceBox.height <= bodyBox.y + bodyBox.height);
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});
