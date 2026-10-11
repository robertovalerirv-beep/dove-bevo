import { expect, test } from "@playwright/test";
import { goToMilano } from "./helpers";

// M0-04: opening the shell (and, from M1, the map) produces no CSP violation.
// Collected two ways: the securitypolicyviolation event and console messages.

declare global {
  interface Window {
    __cspViolations: string[];
  }
}

for (const path of ["/", "/bar/n1"]) {
  test(`no CSP violations on ${path}`, async ({ page }) => {
    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener("securitypolicyviolation", (e) => {
        window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
      });
    });
    const consoleCsp: string[] = [];
    page.on("console", (msg) => {
      if (/content security policy|refused to/i.test(msg.text())) consoleCsp.push(msg.text());
    });

    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");

    expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
    expect(consoleCsp).toEqual([]);
  });
}

test("no CSP violations with the map loaded on Milano (tiles, glyphs, sprites, markers)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  const consoleCsp: string[] = [];
  page.on("console", (msg) => {
    if (/content security policy|refused to/i.test(msg.text())) consoleCsp.push(msg.text());
  });
  await page.goto("/");
  await goToMilano(page);
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
  expect(consoleCsp).toEqual([]);
});
