import { expect, test, type APIResponse } from "@playwright/test";

// M0-03: SPEC 13.1 headers, exact values, on assets and API; no CORS headers.
const EXPECTED: Record<string, string> = {
  "content-security-policy":
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; " +
    "img-src 'self' data: blob:; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self'; " +
    "frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; " +
    "form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(self), payment=(), usb=()",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
};

function expectSecurityHeaders(response: APIResponse) {
  const headers = response.headers();
  for (const [name, value] of Object.entries(EXPECTED)) {
    expect(headers[name], name).toBe(value);
  }
  const cors = Object.keys(headers).filter((name) => name.startsWith("access-control-"));
  expect(cors, "no CORS headers").toEqual([]);
}

test("shell / has the security headers", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  expectSecurityHeaders(response);
});

test("SPA fallback /bar/n1 has the security headers", async ({ request }) => {
  const response = await request.get("/bar/n1");
  expect(response.status()).toBe(200);
  expectSecurityHeaders(response);
});

test("JS asset has the security headers", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const src = /<script[^>]+src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  expect(src, "script asset in the shell").toBeDefined();
  const response = await request.get(src ?? "");
  expect(response.status()).toBe(200);
  expectSecurityHeaders(response);
});

for (const path of ["/api/health", "/api/nonesiste"]) {
  test(`API ${path} has the security headers`, async ({ request }) => {
    const response = await request.get(path, { headers: { Origin: "https://evil.example" } });
    expectSecurityHeaders(response);
  });
}
