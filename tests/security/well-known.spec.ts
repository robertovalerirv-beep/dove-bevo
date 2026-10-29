import { expect, test } from "@playwright/test";

// ADR 0045: only security.txt exists under /.well-known/; a probe for anything else (ai-catalog.json, an agent
// manifest) gets a real 404, never the app page with a 200 that reads as invalid JSON.
for (const path of ["/.well-known/ai-catalog.json", "/.well-known/anything", "/.well-known/"]) {
  test(`${path} is a 404 in plain text, with the security headers`, async ({ request }) => {
    for (const mode of ["cors", "navigate"]) {
      const response = await request.get(path, { headers: { "Sec-Fetch-Mode": mode } });
      expect(response.status(), `${path} ${mode}`).toBe(404);
      expect(response.headers()["content-type"]).toContain("text/plain");
      expect(response.headers()["strict-transport-security"]).toContain("preload");
      expect(response.headers()["content-security-policy"]).toContain("default-src 'self'");
    }
    expect((await request.head(path)).status()).toBe(404);
  });
}

test("security.txt is still served", async ({ request }) => {
  const response = await request.get("/.well-known/security.txt");
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("Contact:");
});

test("the paths of the app are still the app page", async ({ request }) => {
  for (const path of [
    "/privacy",
    "/regole",
    "/admin",
    "/bar/n1",
    "/milano",
    "/copertura",
    "/qualunque",
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain("text/html");
  }
});
