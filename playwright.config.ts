import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const viewport = { width: 390, height: 844 };
const WRITES = "**/contribute.spec.ts";
// Proposed bars stay in the shared local D1 and would join the "5 nearest bars" of the writes above.
const PROPOSALS = "**/propose.spec.ts";

// E2E and security tests run against the production build in workerd (`npm run preview`), over HTTPS:
// the CSP has upgrade-insecure-requests, which WebKit applies to localhost too.
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  // WebKit redraws the map labels slowly under parallel load; 10 s keeps the same assertions stable.
  expect: { timeout: 10_000 },
  reporter: "list",
  use: { baseURL: `https://localhost:${String(PORT)}`, ignoreHTTPSErrors: true },
  projects: [
    // Tests that write prices (contribute.spec.ts) run after the read-only ones, which see the
    // seed untouched: browsers share one local D1 and a new label can hide a seeded one. Then the
    // ones that propose bars (propose.spec.ts).
    {
      name: "chromium",
      testDir: "tests/e2e",
      testIgnore: [WRITES, PROPOSALS],
      use: { ...devices["Desktop Chrome"], viewport },
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
      use: { ...devices["Desktop Chrome"], viewport },
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
      use: { ...devices["Desktop Chrome"], viewport },
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
