import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import brand from "../../docs/brand/tokens.json" with { type: "json" };
import { it as texts } from "../../src/app/i18n/it";
import { APP_NAME } from "../../src/shared/config";
import { renderSw } from "../../scripts/sw";
import { renderManifest, type BrandTokens } from "../../scripts/tokens";

const tokens = brand as BrandTokens;

describe("MB-01 / M4-07 manifest", () => {
  it("is exactly what build-tokens generates (colours from the tokens)", () => {
    const committed = readFileSync("public/manifest.webmanifest", "utf8").replace(/\r\n/g, "\n");
    expect(committed).toBe(renderManifest(tokens, APP_NAME, texts.meta.description));
  });
  it("is installable: name, standalone, start URL, 192/512 and maskable icons", () => {
    const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8")) as {
      name: string;
      display: string;
      start_url: string;
      theme_color: string;
      background_color: string;
      icons: { sizes: string; purpose?: string }[];
    };
    expect(manifest).toMatchObject({ name: "Dove bevo", display: "standalone", start_url: "/" });
    expect(manifest.theme_color).toBe(
      tokens.color.tokens.find((t) => t.name === "spritz")?.value.light,
    );
    expect(manifest.background_color).toBe(
      tokens.color.tokens.find((t) => t.name === "bg")?.value.light,
    );
    expect(manifest.icons.map((i) => i.sizes)).toEqual(["192x192", "512x512", "512x512"]);
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });
});

describe("M4-07 service worker", () => {
  const source = renderSw(["/", "/assets/index-abc.js", "/fonts/a.woff2"], "v1");
  it("names its cache by version and keeps only the listed shell", () => {
    expect(source).toContain('const CACHE = "dovebevo-shell-v1"');
    expect(source).toContain('["/","/assets/index-abc.js","/fonts/a.woff2"]');
  });
  it("never answers /api, /data or other origins, and never writes into the cache by itself", () => {
    expect(source).toContain("url.origin !== self.location.origin");
    expect(source).toContain("SHELL.includes(url.pathname)");
    expect(source).not.toMatch(/\.put\(/);
    expect(source).not.toContain("/api/");
    expect(source).not.toContain("/data/");
  });
  it("opens the cached page when offline and deletes old caches on activate", () => {
    expect(source).toContain('caches.match("/")');
    expect(source).toContain("keys.filter((k) => k !== CACHE)");
  });
});
