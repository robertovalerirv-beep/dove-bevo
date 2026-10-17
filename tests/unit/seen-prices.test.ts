import { describe, expect, it } from "vitest";
import { cellRange, seenPrices } from "../../src/app/lib/tiers";
import type { PriceRow } from "../../src/shared/api-types";

// MB-10: prices already seen in the zone, and "In zona va da X a Y, mediana Z" from 5 prices.
const bar = (
  key: string,
  cents: number,
  over: Partial<{ hh: 0 | 1; q: 0 | 1; cell: string }> = {},
) => ({
  key,
  name: key,
  kind: 1 as const,
  lat: 0,
  lon: 0,
  addr: "",
  city: "",
  cell: over.cell ?? "u0nd9",
  pending: false,
  prices: [[key, "spritz", 0, over.hh ?? 0, cents, "2026-10-01", 0, over.q ?? 0]] as PriceRow[],
});

describe("seenPrices", () => {
  const venues = [
    bar("a", 600),
    bar("b", 600),
    bar("c", 750),
    bar("d", 900, { hh: 1 }),
    bar("e", 800, { q: 1 }),
    bar("f", 500, { cell: "u0nd8" }),
  ];
  it("lists distinct normal-hours active prices of the cell, in ascending order", () => {
    expect(seenPrices(venues, "u0nd9", "spritz", 0)).toEqual([600, 750]);
  });
  it("keeps the most common ones when there are more than the limit", () => {
    const many = [
      ...[500, 600, 700, 800, 900, 1000, 1100].map((c, i) => bar(`m${String(i)}`, c)),
      bar("dup", 1100),
    ];
    expect(seenPrices(many, "u0nd9", "spritz", 0, 3)).toEqual([500, 600, 1100]);
  });
  it("is empty for another drink", () => {
    expect(seenPrices(venues, "u0nd9", "negroni", 0)).toEqual([]);
  });
});

describe("cellRange", () => {
  it("needs at least 5 prices", () => {
    expect(cellRange([bar("a", 500), bar("b", 600)], "u0nd9", "spritz", 0)).toBeNull();
  });
  it("gives min, max and median with 5 prices", () => {
    const five = [500, 600, 700, 800, 1000].map((c, i) => bar(`p${String(i)}`, c));
    expect(cellRange(five, "u0nd9", "spritz", 0)).toEqual({ min: 500, max: 1000, median: 700 });
  });
});
