import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

// SPEC 1.6 (ADR 0028): a drink has no size. Nothing in the code may bring the ml back; the
// migrations are history and may name the column.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(path).isFile() ? [path] : files(path);
  });
}

describe("no sizes in the code", () => {
  const sources = files("src").filter((f) => /\.(ts|tsx|css)$/.test(f));
  it.each(sources)("%s has no size_ml, formatSize or drink size", (path) => {
    const text = readFileSync(path, "utf8");
    expect(text).not.toMatch(/size_ml|formatSize|findSize|defaultSize|DrinkSize/);
  });
});
