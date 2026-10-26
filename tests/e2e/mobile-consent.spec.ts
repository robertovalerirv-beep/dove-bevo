import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixtures";
import { DUOMO } from "./helpers";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MOBILE_REDEEM_PATH } from "../../src/shared/mobile";

test.use({ geolocation: DUOMO, permissions: ["geolocation"] });

async function priceStep(page: Page, fill = true) {
  await page.getByRole("button", { name: "Aggiungi prezzo", exact: true }).click();
  await page
    .getByRole("list", { name: "Bar vicini" })
    .getByRole("button")
    .filter({ hasText: "The View Milano" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Spritz", exact: true }).click();
  if (fill) await page.getByRole("textbox", { name: "Prezzo in euro" }).fill("7,50");
}

async function reachable(button: Locator, page: Page) {
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeInViewport();
  const box = await button.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(47.5);
  expect(box?.width).toBeGreaterThanOrEqual(47.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

const nativeRoot = fileURLToPath(new URL("../../dist/native/", import.meta.url).href);
async function nativeShell(page: Page) {
  await page.route("https://native.example/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const path = join(nativeRoot, pathname === "/" ? "index.html" : pathname.slice(1));
    if (!path.startsWith(nativeRoot) || /[%\\]/.test(pathname) || !existsSync(path))
      return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ path });
  });
  await page.addInitScript((redeemPath: string) => {
    interface RequestOptions {
      url?: string;
      data?: string;
      eventName?: string;
    }
    interface ProofWindow {
      androidBridge: object;
      Capacitor: object;
      consentWrites: object[];
      consentExternal: string[];
    }
    const proof = window as unknown as ProofWindow;
    proof.androidBridge = {};
    proof.consentWrites = [];
    proof.consentExternal = [];
    const events: Record<string, (value: object) => void> = {};
    const methods = (names: string[]) => names.map((name) => ({ name, rtype: "promise" }));
    proof.Capacitor = {
      PluginHeaders: [
        { name: "DoveBevoHttp", methods: methods(["request"]) },
        {
          name: "App",
          methods: [...methods(["getLaunchUrl"]), { name: "addListener", rtype: "callback" }],
        },
        {
          name: "Browser",
          methods: [...methods(["open", "close"]), { name: "addListener", rtype: "callback" }],
        },
        { name: "Geolocation", methods: methods(["checkPermissions", "getCurrentPosition"]) },
      ],
      nativeCallback: (
        _plugin: string,
        _method: string,
        options: RequestOptions,
        callback: (value: object) => void,
      ) => {
        if (options.eventName) events[options.eventName] = callback;
        return Promise.resolve("listener");
      },
      nativePromise: async (plugin: string, method: string, options: RequestOptions = {}) => {
        if (plugin === "DoveBevoHttp") {
          const path = new URL(options.url ?? "https://invalid.example").pathname;
          let body: unknown = {};
          if (path.startsWith("/data/")) {
            const response = await fetch(path);
            return {
              status: response.status,
              headers: { "content-type": "application/json" },
              body: await response.text(),
            };
          }
          if (path.endsWith("/config"))
            body = {
              version: 1,
              clientId: "com.dovebevo.app.preview",
              callbackUrl: "dovebevopreview://auth/callback",
              challengePath: "/mobile-auth",
              dataVersion: "fixture",
            };
          else if (path === redeemPath) body = { token: "test-preview-only", expiresIn: 1800 };
          else if (path === "/api/mobile/prices") {
            proof.consentWrites.push(JSON.parse(options.data ?? "{}") as object);
            body = { results: [{ status: "added" }] };
          } else if (path.startsWith("/api/prices/"))
            body = {
              p: path.endsWith("/u0nd9")
                ? [
                    "n2420779240",
                    "n13001337602",
                    "n5471678323",
                    "n10081337586",
                    "n11755824793",
                    "n12258055483",
                  ].map((key, index) => [key, "spritz", 0, 750 + index * 250, "2026-10-26", 1, 0])
                : [],
              u: [],
              pend: [],
              h: [],
              g: [],
            };
          else if (path === "/api/venues/approved") body = { v: [] };
          return {
            status: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          };
        }
        if (plugin === "Geolocation")
          return method === "getCurrentPosition"
            ? { coords: { latitude: 45.46437, longitude: 9.18951 } }
            : { location: "granted", coarseLocation: "granted" };
        if (plugin === "Browser" && method === "open") {
          const url = new URL(options.url ?? "https://invalid.example");
          if (url.pathname === "/mobile-auth")
            setTimeout(
              () =>
                events.appUrlOpen?.({
                  url: `dovebevopreview://auth/callback?code=${"c".repeat(43)}&state=${url.searchParams.get("nonce") ?? ""}`,
                }),
              0,
            );
          else proof.consentExternal.push(url.href);
        }
        return undefined;
      },
    };
  }, MOBILE_REDEEM_PATH);
}

for (const width of [390, 360]) {
  test(`web ${String(width)}: price submission explicitly accepts linked rules, including quick prices`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const writes: unknown[] = [];
    await page.route("**/api/prices", (route) => {
      writes.push(route.request().postDataJSON() as unknown);
      return route.fulfill({ json: { results: [{ status: "added" }] } });
    });
    await page.route("**/api/session", (route) =>
      route.fulfill({
        json: route.request().method() === "GET" ? { siteKey: "test", action: "contribute" } : {},
      }),
    );
    await page.route("https://challenges.cloudflare.com/**", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: 'window.turnstile={render(e,o){setTimeout(()=>o.callback("test"),0);return "w"},remove(){}}',
      }),
    );
    await page.goto("/");
    await priceStep(page);
    const sheet = page.getByRole("dialog");
    const save = sheet.getByRole("button", { name: "Accetta e salva", exact: true });
    await expect(save).toBeEnabled();
    await expect(sheet).toContainText("prezzi inventati, locali falsi e contenuti offensivi");
    const rules = sheet.getByRole("link", { name: "Regole", exact: true }).last();
    await expect(rules).toHaveAttribute("href", "/regole");
    await reachable(rules, page);
    const popup = page.waitForEvent("popup");
    await rules.click();
    const legal = await popup;
    await expect(legal.getByRole("heading", { name: "Regole", exact: true })).toBeVisible();
    await legal.close();
    const quick = sheet.getByRole("list", { name: "Prezzi già visti qui" }).getByRole("button");
    expect(await quick.count()).toBeGreaterThan(0);
    for (const chip of await quick.all()) {
      await expect(chip).toContainText("Accetta e segna");
      await reachable(chip, page);
    }
    await reachable(save, page);
    await page.screenshot({ path: info.outputPath(`consent-price-${String(width)}.png`) });
    expect(writes).toEqual([]);
    await save.click();
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toMatchObject({ items: [{ drink: "spritz", hh: 0, price_cents: 750 }] });
    expect(Object.keys(writes[0] as object).sort()).toEqual(["cell", "items", "source", "venue"]);
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).every((key) =>
          ["dovebevo-first-use", "dovebevo-prices"].includes(key),
        ),
      ),
    ).toBe(true);
  });

  test(`web ${String(width)}: venue proposal accepts rules before proceeding to its pin`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const writes: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/api/venues"))
        writes.push(request.url());
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Aggiungi locale mancante", exact: true }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("textbox", { name: "Nome del bar" }).fill("Bar della Prova");
    await expect(sheet).toContainText("prezzi inventati, locali falsi e contenuti offensivi");
    const rules = sheet.getByRole("link", { name: "Regole", exact: true });
    await expect(rules).toHaveAttribute("href", "/regole");
    const accept = sheet.getByRole("button", { name: "Accetta e vai avanti", exact: true });
    await reachable(rules, page);
    await reachable(accept, page);
    await page.screenshot({ path: info.outputPath(`consent-venue-${String(width)}.png`) });
    expect(writes).toEqual([]);
    await accept.click();
    await expect(page.getByRole("region", { name: "Dov'è «Bar della Prova»?" })).toBeVisible();
    expect(writes).toEqual([]);
  });
}

test("public privacy describes sponsorship, anonymous daily metrics and both verification flows", async ({
  page,
}) => {
  await page.goto("/privacy");
  const main = page.locator("main");
  await expect(main).toContainText("Sponsorizzato");
  await expect(main).toContainText("conteggi aggregati per giorno");
  await expect(main).toContainText("Sul sito");
  await expect(main).toContainText("Nell'app");
  await expect(main).toContainText("Roberto Valeri, che ne è personalmente responsabile");
  await expect(main).toContainText("codici già usati per un prezzo o una proposta di oggi o ieri");
  await expect(main).toContainText("altre persone sulla rete condivisa");
  await expect(page.getByRole("link", { name: "dovebevo@gmail.com", exact: true })).toHaveAttribute(
    "href",
    "mailto:dovebevo@gmail.com",
  );
  await expect(main).not.toContainText("né pubblicità");
  await expect(main).not.toContainText("Non raccogliamo dati di minori");
});

test.describe("bundled native consent with mocked bridge", () => {
  test.skip(
    !existsSync(join(nativeRoot, "index.html")),
    "Build native preview for bundled-shell checks",
  );
  for (const width of [390, 360]) {
    test(`native ${String(width)}: visible acceptance, external rules and unchanged acknowledged price upload`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await nativeShell(page);
      await page.goto("https://native.example/");
      await priceStep(page);
      const sheet = page.getByRole("dialog");
      const rules = sheet.getByRole("link", { name: "Regole", exact: true }).last();
      await expect(rules).toHaveAttribute("href", "https://www.dovebevo.com/regole");
      await reachable(rules, page);
      await rules.click();
      await expect
        .poll(() =>
          page.evaluate(() => (window as unknown as { consentExternal: string[] }).consentExternal),
        )
        .toEqual(["https://www.dovebevo.com/regole"]);
      const quick = sheet.getByRole("list", { name: "Prezzi già visti qui" }).getByRole("button");
      expect(await quick.count()).toBe(6);
      for (const chip of await quick.all()) {
        await expect(chip).toContainText("Accetta e segna");
        await reachable(chip, page);
      }
      const save = sheet.getByRole("button", { name: "Accetta e salva", exact: true });
      await reachable(save, page);
      await page.screenshot({ path: info.outputPath(`native-consent-price-${String(width)}.png`) });
      await save.click();
      await page.mouse.move(0, 0);
      await expect(page.getByRole("status").filter({ hasText: "Prezzo salvato" })).toBeVisible();
      const writes = await page.evaluate(
        () => (window as unknown as { consentWrites: object[] }).consentWrites,
      );
      expect(writes).toHaveLength(1);
      expect(writes[0]).toMatchObject({ items: [{ drink: "spritz", hh: 0, price_cents: 750 }] });
      expect(Object.keys(writes[0] ?? {}).sort()).toEqual(["cell", "items", "source", "venue"]);
      await page.reload(); // Inspect the proposal independently of the completed price toast.
      await page.getByRole("button", { name: "Aggiungi locale mancante", exact: true }).click();
      const proposal = page.getByRole("dialog");
      await proposal.getByRole("textbox", { name: "Nome del bar" }).fill("Bar della Prova");
      await expect(proposal).toContainText("prezzi inventati, locali falsi e contenuti offensivi");
      await expect(proposal.getByRole("link", { name: "Regole", exact: true })).toHaveAttribute(
        "href",
        "https://www.dovebevo.com/regole",
      );
      const accept = proposal.getByRole("button", { name: "Accetta e vai avanti", exact: true });
      await reachable(accept, page);
      await page.screenshot({ path: info.outputPath(`native-consent-venue-${String(width)}.png`) });
      await accept.click();
      await expect(page.getByRole("region", { name: "Dov'è «Bar della Prova»?" })).toBeVisible();
    });
  }
});

for (const mode of ["web", "native"] as const) {
  for (const width of [390, 360]) {
    test(`${mode} ${String(width)}: autofocus exposes visible rules before Enter accepts price and proposal`, async ({
      page,
    }, info) => {
      test.skip(
        mode === "native" && !existsSync(join(nativeRoot, "index.html")),
        "Build native preview for bundled-shell checks",
      );
      await page.setViewportSize({ width, height: 844 });
      const writes: unknown[] = [];
      const venues: unknown[] = [];
      if (mode === "native") await nativeShell(page);
      else {
        await page.route("**/api/prices", (route) => {
          writes.push(route.request().postDataJSON() as unknown);
          return route.fulfill({ json: { results: [{ status: "added" }] } });
        });
        await page.route("**/api/venues", (route) => {
          venues.push(route.request().postDataJSON() as unknown);
          return route.fulfill({ json: {} });
        });
        await page.route("**/api/session", (route) =>
          route.fulfill({
            json:
              route.request().method() === "GET" ? { siteKey: "test", action: "contribute" } : {},
          }),
        );
        await page.route("https://challenges.cloudflare.com/**", (route) =>
          route.fulfill({
            contentType: "text/javascript",
            body: 'window.turnstile={render(e,o){setTimeout(()=>o.callback("test"),0);return "w"},remove(){}}',
          }),
        );
      }
      await page.goto(mode === "native" ? "https://native.example/" : "/");
      await priceStep(page, false);
      const input = page.getByRole("textbox", { name: "Prezzo in euro" });
      await expect(input).toBeFocused();
      await expect(input).toHaveAccessibleDescription(
        /Premendo Invio.*accetti le Regole.*prezzi inventati, locali falsi e contenuti offensivi/,
      );
      await expect(input).toHaveAttribute("aria-describedby", /price-error/);
      const context = page.locator("#price-quick-rules");
      await expect(context).toBeInViewport({ ratio: 1 });
      await expect(context.getByRole("link", { name: "Regole", exact: true })).toHaveAttribute(
        "href",
        mode === "native" ? "https://www.dovebevo.com/regole" : "/regole",
      );
      await page.screenshot({
        path: info.outputPath(`keyboard-price-${mode}-${String(width)}.png`),
      });
      await page.keyboard.type("7,50");
      await page.keyboard.press("Enter"); // No focus/click on an acceptance button.
      await page.mouse.move(0, 0);
      if (mode === "web") {
        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => "hidden",
          });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await expect.poll(() => writes.length).toBe(1);
      }
      await expect(page.getByRole("status").filter({ hasText: "Prezzo salvato" })).toBeVisible();
      const bodies =
        mode === "native"
          ? await page.evaluate(
              () => (window as unknown as { consentWrites: object[] }).consentWrites,
            )
          : writes;
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).toMatchObject({ items: [{ drink: "spritz", hh: 0, price_cents: 750 }] });
      expect(Object.keys(bodies[0] as object).sort()).toEqual(["cell", "items", "source", "venue"]);

      await page.reload();
      await page.getByRole("button", { name: "Aggiungi locale mancante", exact: true }).click();
      const name = page.getByRole("textbox", { name: "Nome del bar" });
      await expect(name).toBeFocused();
      await expect(name).toHaveAccessibleDescription(
        /Premendo Invio.*accetti le Regole.*prezzi inventati, locali falsi e contenuti offensivi/,
      );
      await expect(name).toHaveAttribute("aria-describedby", /venue-name-hint venue-name-error/);
      await expect(page.locator("#venue-contribution-rules")).toBeInViewport({ ratio: 1 });
      await page.screenshot({
        path: info.outputPath(`keyboard-venue-${mode}-${String(width)}.png`),
      });
      await page.keyboard.type("Bar della Prova");
      await page.keyboard.press("Enter");
      await expect(page.getByRole("region", { name: "Dov'è «Bar della Prova»?" })).toBeVisible();
      expect(venues).toEqual([]); // Acceptance precedes pin confirmation and its upload.
    });
  }
}
