import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const viewport = { width: 390, height: 844 };

// E2E and security tests run against the production build in workerd (`npm run preview`), over HTTPS:
// the CSP has upgrade-insecure-requests, which WebKit applies to localhost too.
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: `https://localhost:${String(PORT)}`, ignoreHTTPSErrors: true },
  projects: [
    { name: "chromium", testDir: "tests/e2e", use: { ...devices["Desktop Chrome"], viewport } },
    { name: "webkit", testDir: "tests/e2e", use: { ...devices["Desktop Safari"], viewport } },
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
