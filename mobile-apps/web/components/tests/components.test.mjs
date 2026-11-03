import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdirSync, mkdtempSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { Buffer } from "node:buffer";
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
async function fixture(options = {}) {
  let menuFailures = options.menuFailOnce ? 1 : 0;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const writes = [];
  await page.route("**/*", (route) => {
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
    if (pathname.startsWith("/api/mobile/v2/customer-prices/venues/")) {
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
          rows: [
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
          ],
          next_after: null,
        },
      });
    }
    if (pathname.startsWith("/api/mobile/v2/menu/venues/")) {
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
        category: "spritz",
        serving: { label: "Calice", ml: null },
        amount_minor: amount,
        currency: "EUR",
        currency_exponent: 2,
        context,
        source,
      });
      const after = new URL(request.url()).searchParams.get("after");
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
            country: "IT",
          },
          stored_offer_count: 3,
          offers: after
            ? [offer("third", "Analcolico", 450)]
            : [
                offer("first", "Spritz <script>", 750),
                offer("second", "Spritz serale", 550, {
                  kind: "conditional",
                  condition: "dopo le 18",
                }),
              ],
          next_after: after ? null : "second",
          fees: [
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
test("menu loading failure can retry while legacy customer prices remain", async () => {
  const f = await fixture({ menuFailOnce: true });
  try {
    await f.page.evaluate(() => window.sheetFixture.bar());
    await f.page.getByRole("button", { name: "Riprova menu" }).waitFor();
    assert.match(await f.page.locator(".mobile-price--featured").innerText(), /6,00 €/);
    await f.page.getByRole("button", { name: "Riprova menu" }).click();
    await f.page.getByText("Spritz <script>").waitFor();
    assert.deepEqual(f.writes, []);
  } finally {
    await f.close();
  }
});
