import { expect, test } from "@playwright/test";

// M0-02: Worker with static assets, SPA fallback, /api/health and JSON 404.

for (const path of ["/", "/bar/n1"]) {
  test(`GET ${path} returns the app shell`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["content-type"]).toContain("text/html");
    // The home carries the title for search engines (ADR 0025): it starts with the name.
    await expect(page).toHaveTitle(/^Dove bevo/);
    await expect(page.getByRole("heading", { level: 1, name: "Dove bevo" })).toBeVisible();
  });
}

test("GET /api/health reports status and versions", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/json");
  const body: unknown = await response.json();
  expect(body).toEqual({
    status: "ok",
    version: expect.stringMatching(/^\d+\.\d+\.\d+$/) as unknown,
    data_version: "fixture",
  });
});

test("unknown API route returns a JSON not_found error", async ({ request }) => {
  const response = await request.get("/api/nonesiste");
  expect(response.status()).toBe(404);
  expect(response.headers()["content-type"]).toContain("application/json");
  const body: unknown = await response.json();
  expect(body).toEqual({ error: { code: "not_found", message: expect.any(String) as unknown } });
});
