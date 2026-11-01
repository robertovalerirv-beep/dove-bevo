import { expect, test, type APIResponse } from "@playwright/test";

// M0-03: SPEC 13.1 headers, exact values, on assets and API; no CORS headers. A page gets a new nonce on each
// request (ADR 0045): its CSP is compared with the nonce taken out; the other responses carry the fixed CSP.
const CSP_REST =
  "img-src 'self' data: blob:; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self'; " +
  "frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; " +
  "form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests; require-trusted-types-for 'script'";
const STATIC_CSP =
  "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; " +
  CSP_REST;
const PAGE_CSP =
  "default-src 'self'; script-src 'nonce-N' 'strict-dynamic' 'self' https://challenges.cloudflare.com; " +
  "style-src 'self' 'nonce-N'; " +
  CSP_REST;
const withoutNonce = (csp: string | undefined) => csp?.replace(/'nonce-[^']+'/g, "'nonce-N'");

const EXPECTED: Record<string, string> = {
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(self), payment=(), usb=()",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
};

function expectSecurityHeaders(response: APIResponse, page = false) {
  const headers = response.headers();
  expect(
    page ? withoutNonce(headers["content-security-policy"]) : headers["content-security-policy"],
  ).toBe(page ? PAGE_CSP : STATIC_CSP);
  for (const [name, value] of Object.entries(EXPECTED)) {
    expect(headers[name], name).toBe(value);
  }
  const cors = Object.keys(headers).filter((name) => name.startsWith("access-control-"));
  expect(cors, "no CORS headers").toEqual([]);
}

test("shell / has the security headers", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  expectSecurityHeaders(response, true);
});

test("SPA fallback /bar/n1 has the security headers", async ({ request }) => {
  const response = await request.get("/bar/n1");
  expect(response.status()).toBe(200);
  expectSecurityHeaders(response, true);
});

test("app-only asset and venue reload retain page nonces without replacing the website", async ({
  request,
}) => {
  const website = await (await request.get("/")).text();
  expect(website).not.toContain('data-dovebevo-mobile-shell="1"');
  for (const path of ["/mobile/", "/mobile/?path=%2Fbar%2Fn123&c=u0nd9"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expectSecurityHeaders(response, true);
    const html = await response.text();
    expect(html).toContain('data-dovebevo-mobile-shell="1"');
    const nonce = /'nonce-([^']+)'/.exec(response.headers()["content-security-policy"] ?? "")?.[1];
    expect(nonce).toBeTruthy();
    expect(html).toContain(`nonce="${nonce ?? ""}"`);
    const entry = /<script[^>]+src="(\/assets\/mobile\/[^"]+\.js)"/.exec(html)?.[1];
    expect(entry).toBeTruthy();
    const asset = await request.get(entry ?? "");
    expect(asset.status()).toBe(200);
    expectSecurityHeaders(asset);
  }
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
