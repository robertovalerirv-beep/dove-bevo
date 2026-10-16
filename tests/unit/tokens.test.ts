import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import brand from "../../docs/brand/tokens.json" with { type: "json" };
import {
  contrast,
  renderTokens,
  TEXT_PAIRS,
  UI_PAIRS,
  type BrandTokens,
} from "../../scripts/tokens.ts";

const tokens = brand as BrandTokens;
// Line endings may differ on Windows checkouts; the content may not.
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
// Folders under src/ have no dot in their name; files always have an extension.
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) =>
    name.includes(".") ? [`${dir}/${name}`] : walk(`${dir}/${name}`),
  );
// Every source file the app ships (CSS, TS, TSX) plus the HTML shell.
const sources = Object.fromEntries(
  [...walk("src").filter((f) => /\.(ts|tsx|css)$/.test(f)), "index.html"].map((path) => [
    path,
    read(path),
  ]),
);

describe("MB-01 tokens from one source", () => {
  it("tokens.css is exactly what build-tokens generates from docs/brand/tokens.json", () => {
    expect(read("src/app/styles/tokens.css")).toBe(renderTokens(tokens));
  });

  it("no hexadecimal colour outside the generated tokens.css", () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => path !== "src/app/styles/tokens.css")
      .flatMap(([path, text]) =>
        [...text.matchAll(/(?<![\w&/-])#[0-9a-fA-F]{3,8}\b/g)].map((m) => `${path}: ${m[0]}`),
      );
    expect(offenders).toEqual([]);
  });
});

describe("MB-03 contrast in Bancone and Fuori orario", () => {
  const value = (name: string, theme: "light" | "dark") => {
    const token = tokens.color.tokens.find((c) => c.name === name);
    if (!token) throw new Error(`missing token ${name}`);
    return token.value[theme];
  };
  for (const theme of ["light", "dark"] as const) {
    it.each(TEXT_PAIRS)(`${theme}: text %s on %s ≥ 4.5:1`, (fg, bg) => {
      expect(contrast(value(fg, theme), value(bg, theme))).toBeGreaterThanOrEqual(4.5);
    });
    it.each(UI_PAIRS)(`${theme}: %s on %s ≥ 3:1`, (fg, bg) => {
      expect(contrast(value(fg, theme), value(bg, theme))).toBeGreaterThanOrEqual(3);
    });
  }
});
