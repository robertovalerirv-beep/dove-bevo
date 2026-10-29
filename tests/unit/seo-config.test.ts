import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEO_CITIES } from "../../src/worker/config";
import { seoText } from "../../src/worker/seo-texts";

// ADR 0045: every page runs the Worker first, which gives it a nonce; files are served without it.
describe("run_worker_first in wrangler.jsonc", () => {
  const source = readFileSync("wrangler.jsonc", "utf8");
  const list = /"run_worker_first":\s*\[([^\]]*)\]/.exec(source)?.[1] ?? "";
  const paths: string[] = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");

  it("sends every page through the Worker, the SEO ones included", () => {
    expect(paths).toContain("/*");
    // The SEO pages (ADR 0025) are pages: /* covers the home, /copertura, /bar/* and the city slugs.
    for (const slug of Object.keys(SEO_CITIES)) expect(paths).not.toContain(`!/${slug}`);
    expect(paths).not.toContain("!/");
    expect(paths.some((p) => p.includes("admin"))).toBe(false);
  });

  it("does not send the files through the Worker", () => {
    for (const out of ["!/assets/*", "!/fonts/*", "!/brand/*", "!/data/*", "!/map/*", "!/sw.js"])
      expect(paths).toContain(out);
    // /.well-known/* stays with the Worker: only security.txt exists there, the rest is a 404.
    expect(paths).not.toContain("!/.well-known/*");
  });
});

describe("texts for crawlers", () => {
  it("name the product and never an admin URL", () => {
    expect(seoText.llms("https://x.example")).not.toMatch(/admin/);
    expect(seoText.robots("https://x.example")).toContain("Disallow: /admin");
  });
});
