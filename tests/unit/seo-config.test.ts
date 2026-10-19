import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEO_CITIES } from "../../src/worker/config";
import { seoText } from "../../src/worker/seo-texts";

// ADR 0025: the pages the Worker enriches must be the ones that run the Worker first.
describe("run_worker_first in wrangler.jsonc", () => {
  const source = readFileSync("wrangler.jsonc", "utf8");
  const list = /"run_worker_first":\s*\[([^\]]*)\]/.exec(source)?.[1] ?? "";
  const paths: string[] = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");

  it("has the API, the SEO pages and a path for every SEO city, and no admin", () => {
    expect(paths).toEqual(
      expect.arrayContaining([
        "/api/*",
        "/",
        "/copertura",
        "/bar/*",
        "/robots.txt",
        "/llms.txt",
        "/sitemap.xml",
      ]),
    );
    expect(paths.filter((p) => /^\/[a-z]+$/.test(p) && !p.endsWith(".txt"))).toEqual(
      expect.arrayContaining(Object.keys(SEO_CITIES).map((slug) => `/${slug}`)),
    );
    expect(paths.some((p) => p.includes("admin"))).toBe(false);
  });

  it("does not send every asset through the Worker", () => {
    expect(paths).not.toContain("/*");
    expect(paths).not.toContain("/assets/*");
  });
});

describe("texts for crawlers", () => {
  it("name the product and never an admin URL", () => {
    expect(seoText.llms("https://x.example")).not.toMatch(/admin/);
    expect(seoText.robots("https://x.example")).toContain("Disallow: /admin");
  });
});
