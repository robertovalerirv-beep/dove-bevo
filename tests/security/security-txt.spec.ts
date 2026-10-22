import { expect, test } from "@playwright/test";

// M5-09 (RFC 9116): /.well-known/security.txt is a plain-text file with Contact and Expires, and it
// carries no personal email address (red-team audit 22/10/2026).
test("security.txt follows RFC 9116 and has the security headers", async ({ request }) => {
  const response = await request.get("/.well-known/security.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^text\/plain/);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["content-security-policy"]).toContain("default-src 'self'");
  const text = await response.text();
  expect(text).toMatch(/^Contact: https:\/\/\S+$/m);
  expect(text).not.toMatch(/@/);
  const expires = /^Expires: (\S+)$/m.exec(text)?.[1];
  expect(expires).toBeDefined();
  const when = Date.parse(expires ?? "");
  expect(when).toBeGreaterThan(Date.now()); // renew it before it lapses (RFC 9116 section 2.5.5)
  expect(when).toBeLessThan(Date.now() + 366 * 86_400_000); // and keep it under a year
});

test("robots.txt is present", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("User-agent: *");
});
