import { expect, test } from "@playwright/test";

// M1-04: static bar data is immutable per DATA_VERSION (SPEC 5.3).
const IMMUTABLE = "public, max-age=31536000, immutable";

for (const path of ["/data/fixture/v/u0nd9.json", "/data/fixture/places.json"]) {
  test(`${path} is served with an immutable cache`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe(IMMUTABLE);
    expect(response.headers()["content-type"]).toContain("application/json");
  });
}

test("the app shell is not cached as immutable", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["cache-control"] ?? "").not.toContain("immutable");
});
