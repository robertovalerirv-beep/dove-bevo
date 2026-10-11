import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const viewport = { width: 390, height: 844 };

// E2E runs against the production build served by `vite preview` (Worker in workerd, fixture data).
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: `http://localhost:${String(PORT)}` },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport } },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport } },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
