import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4173); // another checkout may hold 4173
const viewport = { width: 390, height: 844 };
// Chromium refuses a service worker behind a self-signed certificate unless told otherwise (PWA e2e).
const CHROMIUM_LAUNCH = { args: ["--ignore-certificate-errors"] };
// The tests that write to the shared local D1: prices, and a bar made «Gestore verificato» (MD-07).
const WRITES = "**/{contribute,verified-writes}.spec.ts";
// Proposed bars stay in the shared local D1 and would join the "5 nearest bars" of the writes above.
const PROPOSALS = "**/propose.spec.ts";

// E2E and security tests run against the production build in workerd (`npm run preview`), over HTTPS:
// the CSP has upgrade-insecure-requests, which WebKit applies to localhost too.
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  // Under the parallel load of the whole suite (and a busy CI runner) WebKit tests that wait for the real
  // map tiles ran at 20–30 s, right at the old 30 s cap: a different one timed out on every run.
  timeout: 60_000,
  // WebKit redraws the map labels slowly under parallel load (and a CI runner is slower still); 20 s keeps the same assertions stable.
  expect: { timeout: 20_000 },
  // A test that fails is run again on CI (shared runners stall now and then); one that fails every
  // time still fails the job, and a pass after a retry is reported as flaky.
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `https://localhost:${String(PORT)}`,
    ignoreHTTPSErrors: true,
    // A controlling service worker hides requests from page.route(): only tests/e2e/pwa.spec.ts allows it.
    serviceWorkers: "block",
  },
  projects: [
    // Tests that write prices (contribute.spec.ts) run after the read-only ones, which see the
    // seed untouched: browsers share one local D1 and a new label can hide a seeded one. Then the
    // ones that propose bars (propose.spec.ts).
    {
      name: "chromium",
      testDir: "tests/e2e",
      testIgnore: [WRITES, PROPOSALS],
      use: { ...devices["Desktop Chrome"], viewport, launchOptions: CHROMIUM_LAUNCH },
    },
    {
      name: "webkit",
      testDir: "tests/e2e",
      testIgnore: [WRITES, PROPOSALS],
      use: { ...devices["Desktop Safari"], viewport },
    },
    {
      name: "chromium-writes",
      testDir: "tests/e2e",
      testMatch: WRITES,
      dependencies: ["chromium", "webkit"],
      use: { ...devices["Desktop Chrome"], viewport, launchOptions: CHROMIUM_LAUNCH },
    },
    {
      name: "webkit-writes",
      testDir: "tests/e2e",
      testMatch: WRITES,
      dependencies: ["chromium", "webkit"],
      use: { ...devices["Desktop Safari"], viewport },
    },
    {
      name: "chromium-proposals",
      testDir: "tests/e2e",
      testMatch: PROPOSALS,
      dependencies: ["chromium-writes", "webkit-writes"],
      use: { ...devices["Desktop Chrome"], viewport, launchOptions: CHROMIUM_LAUNCH },
    },
    {
      name: "webkit-proposals",
      testDir: "tests/e2e",
      testMatch: PROPOSALS,
      dependencies: ["chromium-writes", "webkit-writes"],
      use: { ...devices["Desktop Safari"], viewport },
    },
    // HTTP-level checks (tests/security): no browser needed.
    { name: "security", testDir: "tests/security" },
  ],
  webServer: {
    command: `npm run fixture && npm run db:local && npm run build && npm run preview -- --port ${String(PORT)}`,
    url: `https://localhost:${String(PORT)}/api/health`,
    ignoreHTTPSErrors: true,
    env: { WRANGLER_SEND_METRICS: "false" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
