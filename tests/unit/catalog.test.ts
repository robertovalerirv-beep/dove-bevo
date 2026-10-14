import { describe, expect, it } from "vitest";
import { CATALOG, DEFAULT_CHIP, MAP_CHIPS, findSize } from "../../src/shared/catalog";

describe("map filters and price entry share one catalog", () => {
  it("has a chip for every drink and size that can be entered, and no other", () => {
    const entered = CATALOG.flatMap((d) => d.sizes.map((s) => `${d.code}@${String(s.ml)}`));
    expect(MAP_CHIPS.map((c) => c.id)).toEqual(entered);
  });

  it("every chip is a drink and size the API accepts", () => {
    for (const chip of MAP_CHIPS) expect(findSize(chip.drink, chip.size)).toBeDefined();
  });

  it("starts on a chip that exists", () => {
    expect(MAP_CHIPS.map((c) => c.id)).toContain(DEFAULT_CHIP.id);
  });
});
