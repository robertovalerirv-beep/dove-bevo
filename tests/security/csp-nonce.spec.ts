import { expect, test } from "@playwright/test";

// ADR 0045: every page gets a new nonce on each request, the same in the CSP and on every script and style
// of the page; nothing in the page blocks the first paint; the other responses carry the fixed CSP.
const NONCE =
  /script-src 'nonce-([^']+)' 'strict-dynamic' 'self' https:\/\/challenges\.cloudflare\.com/;

for (const path of ["/", "/privacy", "/regole", "/admin", "/bar/n1", "/qualunque"]) {
  test(`${path}: the nonce of the CSP is on every script and style, and is new at each request`, async ({
    request,
  }) => {
    const first = await request.get(path);
    const second = await request.get(path);
    const csp = first.headers()["content-security-policy"] ?? "";
    const nonce = NONCE.exec(csp)?.[1];
    expect(nonce, "nonce in script-src").toBeTruthy();
    expect(csp).toContain(`style-src 'self' 'nonce-${nonce ?? ""}'`);
    expect(csp).toContain("require-trusted-types-for 'script'");
    expect(csp).not.toContain("unsafe-inline");
    expect(NONCE.exec(second.headers()["content-security-policy"] ?? "")?.[1]).not.toBe(nonce);
    expect(
      first.headers()["etag"],
      "no validator: a 304 would pair the new nonce with an old body",
    ).toBeUndefined();

    const html = await first.text();
    const tags = html.match(/<(?:script|style)\b[^>]*>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag, tag).toContain(`nonce="${nonce ?? ""}"`);
    // The nonce of another request is not in this page.
    expect(html).not.toContain(
      NONCE.exec(second.headers()["content-security-policy"] ?? "")?.[1] ?? "x\u0000",
    );
  });
}

test("the page has the theme script and the stylesheet inside, and nothing that blocks the first paint", async ({
  request,
}) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain("root.dataset.theme");
  expect(html).toMatch(/<style\b[^>]*>[^<]*--/);
  expect(html).not.toMatch(/<script\b(?![^>]*type="module")[^>]*\bsrc=/);
  expect(html).not.toMatch(/<link\b[^>]*rel="stylesheet"/);
  expect(html).not.toContain("/theme.js");
  expect(html).not.toMatch(/setAttribute\(\s*["']fetchpriority/);
});

test("the files and the API keep the fixed CSP, with no nonce", async ({ request }) => {
  const home = await (await request.get("/")).text();
  const entry = /<script[^>]+src="(\/assets\/[^"]+\.js)"/.exec(home)?.[1] ?? "";
  for (const path of [entry, "/api/health", "/sw.js", "/manifest.webmanifest"]) {
    const csp = (await request.get(path)).headers()["content-security-policy"] ?? "";
    expect(csp, path).toContain("script-src 'self' https://challenges.cloudflare.com;");
    expect(csp, path).not.toContain("nonce-");
  }
});
