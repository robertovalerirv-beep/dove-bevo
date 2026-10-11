import { describe, expect, it } from "vitest";
import packageJson from "../../package.json" with { type: "json" };

// SPEC 4.1 plus the lint configuration packages (ADR 0008) and the renamed Vitest plugin (ADR 0012).
const ALLOWED_RUNTIME = ["preact", "maplibre-gl", "hono", "zod"];
const ALLOWED_DEV = [
  "vite",
  "@preact/preset-vite",
  "@cloudflare/vite-plugin",
  "wrangler",
  "typescript",
  "vitest",
  "@cloudflare/vitest-pool-workers",
  "@cloudflare/vitest-plugin", // renamed successor of the pool (ADR 0012)
  "@playwright/test",
  "@axe-core/playwright",
  "eslint",
  "prettier",
  "@lhci/cli",
  "typescript-eslint",
  "@eslint/js",
];
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const pkg: PackageJson = packageJson;

describe("package.json dependencies (SPEC 4.1)", () => {
  it("lists only allowed runtime dependencies", () => {
    const extra = Object.keys(pkg.dependencies ?? {}).filter((n) => !ALLOWED_RUNTIME.includes(n));
    expect(extra, "runtime dependencies outside SPEC 4.1").toEqual([]);
  });

  it("lists only allowed dev dependencies", () => {
    const extra = Object.keys(pkg.devDependencies ?? {}).filter((n) => !ALLOWED_DEV.includes(n));
    expect(extra, "dev dependencies outside SPEC 4.1 / ADR 0008 / ADR 0012").toEqual([]);
  });

  it("has no optional or peer dependencies", () => {
    expect(pkg.optionalDependencies ?? {}).toEqual({});
    expect(pkg.peerDependencies ?? {}).toEqual({});
  });

  it("pins every dependency to an exact version", () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    const loose = Object.entries(all)
      .filter(([, v]) => !EXACT_VERSION.test(v))
      .map(([n, v]) => `${n}@${v}`);
    expect(loose, "versions must be exact (no ^, ~, ranges or tags)").toEqual([]);
  });
});
