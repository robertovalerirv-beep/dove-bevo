import { expect, test } from "@playwright/test";

// ADR 0025: the pages the Worker enriches for search engines run the Worker first in the real
// configuration (wrangler.jsonc), keep every security header, and never expose the admin.
test("robots.txt, llms.txt and sitemap.xml are served by the Worker", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("User-agent: GPTBot");
  const llms = await request.get("/llms.txt");
  expect(llms.status()).toBe(200);
  expect(await llms.text()).toContain("# Dove bevo");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain("<urlset");
  expect(xml).not.toContain("admin");
});

test("the home carries the tags and JSON-LD for crawlers, and the CSP is intact", async ({
  request,
}) => {
  const response = await request.get("/");
  const html = await response.text();
  expect(html).toContain("application/ld+json");
  expect(html).toContain('rel="canonical"');
  expect(html).toContain("<noscript><main>");
  expect(response.headers()["content-security-policy"]).toContain("default-src 'self'");
  expect(response.headers()["access-control-allow-origin"]).toBeUndefined();
});

test("a city page and the coverage page answer with the shell and their own tags", async ({
  request,
}) => {
  const milano = await (await request.get("/milano")).text();
  expect(milano).toMatch(new RegExp('rel="canonical" href="https?:[^"]+milano"'));
  expect(milano).toMatch(/<title>[^<]*Milano/);
  const coverage = await (await request.get("/copertura")).text();
  expect(coverage).toContain("Copertura");
});

test("the admin and other pages get no SEO tags", async ({ request }) => {
  for (const path of ["/admin", "/privacy", "/qualunque-cosa"]) {
    const html = await (await request.get(path)).text();
    expect(html, path).not.toContain("application/ld+json");
  }
});

test("the open search for assistants answers JSON with no CORS header", async ({ request }) => {
  const response = await request.get("/api/ai/cerca?citta=Milano");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(response.headers()["access-control-allow-origin"]).toBeUndefined();
  const body: unknown = await response.json();
  expect(body).toMatchObject({ pagina: 1, bar: expect.any(Array) });
  expect((await request.get("/api/ai/cerca?page=0")).status()).toBe(400);
});
