import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG } from "../../src/shared/catalog";

// MB-05: one inline icon per catalog code, in the single Icon module, drawn with currentColor.
const icon = readFileSync("src/app/components/Icon.tsx", "utf8");

describe("MB-05 drink icons", () => {
  it.each(CATALOG.map((d) => d.code))("%s has its own icon path", (code) => {
    expect(icon).toMatch(new RegExp(`\\n  ${code}:\\s*\\n?\\s*"M`));
  });
  it("icons follow the theme and are decorative", () => {
    expect(icon).toContain('stroke="currentColor"');
    expect(icon).toContain('aria-hidden="true"');
  });
});
