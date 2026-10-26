import { expect, test } from "@playwright/test";
import { it } from "../../src/app/i18n/it";
import {
  MOBILE_CALLBACK_URL,
  MOBILE_CLIENT_ID,
  MOBILE_PROTOCOL_VERSION,
} from "../../src/shared/mobile";

const codeChallenge = "a".repeat(43);
const nonce = "b".repeat(43);
const path = () =>
  "/mobile-auth?" +
  new URLSearchParams({ codeChallenge, nonce, clientId: MOBILE_CLIENT_ID }).toString();

test("invalid native challenge never loads verification or requests a session", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/") || request.url().includes("challenges.cloudflare"))
      requests.push(request.url());
  });
  await page.goto("/mobile-auth?redirect=https://example.com");
  await expect(page.locator("#mobile-status")).toHaveText(it.mobileAuth.invalid);
  await expect(page).toHaveURL(/\/mobile-auth$/);
  expect(requests).toEqual([]);
});

test("hosted challenge works without AbortSignal.timeout and omits browser credentials", async ({
  page,
  context,
}) => {
  // Safari on the supported iOS 15 floor has AbortController, but no static timeout method.
  await page.addInitScript(() => {
    Object.defineProperty(AbortSignal, "timeout", { value: undefined, configurable: true });
  });
  // A website cookie deliberately exists: the native authorization page must omit it.
  await context.addCookies([
    { name: "unrelated", value: "sentinel", domain: "localhost", path: "/", secure: true },
  ]);
  const apiCookies: (string | undefined)[] = [];
  let submitted: unknown;
  await page.route("**/api/mobile/config", async (route) => {
    apiCookies.push(route.request().headers()["cookie"]);
    await route.fulfill({
      json: {
        version: MOBILE_PROTOCOL_VERSION,
        clientId: MOBILE_CLIENT_ID,
        callbackUrl: MOBILE_CALLBACK_URL,
      },
    });
  });
  await page.route("**/api/session", async (route) => {
    apiCookies.push(route.request().headers()["cookie"]);
    await route.fulfill({ json: { siteKey: "test-site", action: "contribute" } });
  });
  await page.route(
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `globalThis.turnstile = { render(container, options) {
        container.dataset.action = options.action;
        container.dataset.challenge = options.cData;
        options.callback('test-proof');
        return 'test-widget';
      } };`,
      }),
  );
  await page.route("**/api/mobile/authorize", async (route) => {
    apiCookies.push(route.request().headers()["cookie"]);
    expect(route.request().headers()["authorization"]).toBeUndefined();
    submitted = route.request().postDataJSON() as unknown;
    // An incorrect server state must never open the app callback.
    await route.fulfill({ json: { code: "c".repeat(43), state: "wrong-state" } });
  });
  await page.goto(path());
  await expect(page.locator("#mobile-status")).toHaveText(it.mobileAuth.failed);
  await expect(page.locator("#mobile-challenge")).toHaveAttribute("data-action", "contribute");
  await expect(page.locator("#mobile-challenge")).toHaveAttribute("data-challenge", codeChallenge);
  await expect(page).toHaveURL(/\/mobile-auth$/);
  expect(submitted).toEqual({
    codeChallenge,
    nonce,
    clientId: MOBILE_CLIENT_ID,
    token: "test-proof",
  });
  expect(apiCookies).toEqual([undefined, undefined, undefined]);
});

test("a disabled preview fails visibly before requesting a challenge", async ({ page }) => {
  await page.route("**/api/mobile/config", (route) => route.fulfill({ status: 404, body: "" }));
  let loadedChallenge = false;
  await page.route("https://challenges.cloudflare.com/**", (route) => {
    loadedChallenge = true;
    return route.abort();
  });
  await page.goto(path());
  await expect(page.locator("#mobile-status")).toHaveText(it.mobileAuth.failed);
  expect(loadedChallenge).toBe(false);
});
