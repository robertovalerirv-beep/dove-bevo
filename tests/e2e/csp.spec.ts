import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
import { DUOMO, goToMilano, stubTurnstile, stubWrites } from "./helpers";

// This file checks the real basemap against the CSP: tiles, glyphs and sprites come from OpenFreeMap.
test.use({ realTiles: true });

// M0-04, MB-14, SPEC 13.1 (1.15: nonce, 'strict-dynamic', Trusted Types): every view and the contribution
// flow (Turnstile is loaded through the Trusted Types policy) produce no CSP violation.
// Collected two ways: the securitypolicyviolation event and console messages.

declare global {
  interface Window {
    __cspViolations: string[];
  }
}

/** Starts collecting CSP and Trusted Types violations; call before the first navigation. */
async function watchCsp(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  const consoleCsp: string[] = [];
  page.on("console", (msg) => {
    if (/content security policy|refused to|trusted ?type/i.test(msg.text()))
      consoleCsp.push(msg.text());
  });
  return async () => [...(await page.evaluate(() => window.__cspViolations)), ...consoleCsp];
}

for (const path of ["/", "/bar/n1", "/privacy", "/regole", "/admin"]) {
  test(`no CSP violations on ${path}`, async ({ page }) => {
    const violations = await watchCsp(page);
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await violations()).toEqual([]);
  });
}

test("no CSP violations with the map loaded on Milano (tiles, glyphs, sprites, markers)", async ({
  page,
}) => {
  const violations = await watchCsp(page);
  await page.goto("/");
  await goToMilano(page);
  await page.waitForLoadState("networkidle");
  expect(await violations()).toEqual([]);
});

test.describe("with the position (Duomo)", () => {
  test.use({ geolocation: DUOMO, permissions: ["geolocation"] });

  test("no CSP violations while saving a price: Turnstile loads through the Trusted Types policy", async ({
    page,
  }) => {
    test.slow(); // waits out the undo window before the request leaves
    const violations = await watchCsp(page);
    const turnstile = await stubTurnstile(page);
    const sent = await stubWrites(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Aggiungi prezzo" }).click();
    await page.getByRole("list", { name: "Bar vicini" }).getByRole("button").first().click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Spritz/ })
      .click();
    await page.keyboard.type("7,50");
    await page.getByRole("button", { name: "Salva" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Prezzo salvato" })).toBeVisible();
    await expect.poll(() => turnstile.length).toBeGreaterThan(0);
    await expect.poll(() => sent.length, { timeout: 20_000 }).toBe(1);
    expect(await violations()).toEqual([]);
  });
});
