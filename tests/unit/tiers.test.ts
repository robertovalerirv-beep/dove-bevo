import { describe, expect, it } from "vitest";
import { cellMedian, coverage, isStale, medianOf, tierOf } from "../../src/app/lib/tiers";
import type { PriceRow } from "../../src/shared/api-types";

const row = (
  key: string,
  cents: number,
  over: Partial<{ hh: 0 | 1; q: 0 | 1; drink: string }> = {},
): PriceRow => [key, over.drink ?? "spritz", 0, over.hh ?? 0, cents, "2026-10-01", 0, over.q ?? 0];
const venue = (key: string, cell: string, prices: PriceRow[]) => ({
  key,
  name: key,
  kind: 1,
  lat: 0,
  lon: 0,
  addr: "",
  city: "",
  cell,
  prices,
  pending: false,
});

describe("M4-03 / MB-07 tiers (D-12)", () => {
  it("median of odd and even samples", () => {
    expect(medianOf([500, 700, 600])).toBe(600);
    expect(medianOf([500, 600, 700, 800])).toBe(650);
  });
  it("below 0.9x is Affare, above 1.1x is Salato, otherwise Giusto; limits are inclusive of Giusto", () => {
    expect(tierOf(540, 600)).toBe("giusto");
    expect(tierOf(539, 600)).toBe("affare");
    expect(tierOf(660, 600)).toBe("giusto");
    expect(tierOf(661, 600)).toBe("salato");
  });
  it("neutral without a median", () => {
    expect(tierOf(500, null)).toBe("neutro");
  });
  it("median needs at least 5 active normal prices of the drink in the cell", () => {
    const four = [1, 2, 3, 4].map((i) =>
      venue(`n${String(i)}`, "c", [row(`n${String(i)}`, 500 + i)]),
    );
    expect(cellMedian(four, "c", "spritz", 0)).toBeNull();
    const five = [...four, venue("n5", "c", [row("n5", 700)])];
    expect(cellMedian(five, "c", "spritz", 0)).toBe(503);
  });
  it("ignores quarantine, happy hour, other drinks and other cells", () => {
    const base = [1, 2, 3, 4, 5].map((i) =>
      venue(`n${String(i)}`, "c", [row(`n${String(i)}`, 600)]),
    );
    const noise = [
      venue("q", "c", [row("q", 100, { q: 1 })]),
      venue("h", "c", [row("h", 100, { hh: 1 })]),
      venue("d", "c", [row("d", 100, { drink: "gin_tonic" })]),
      venue("o", "x", [row("o", 100)]),
    ];
    expect(cellMedian([...base, ...noise], "c", "spritz", 0)).toBe(600);
  });
  it("stale after 90 days", () => {
    expect(isStale("2026-07-19", "2026-10-17")).toBe(false); // 90 days
    expect(isStale("2026-07-18", "2026-10-17")).toBe(true); // 91 days
  });
});

describe("MB-08 coverage", () => {
  it("counts bars with a price for the chosen drink", () => {
    const vs = [
      venue("a", "c", [row("a", 500)]),
      venue("b", "c", [row("b", 600, { hh: 1 })]),
      venue("c", "c", [row("c", 600, { q: 1 })]),
      venue("d", "c", []),
    ];
    expect(coverage(vs, "spritz", 0)).toEqual({ withPrice: 2, total: 4, empty: false });
  });
  it("an empty zone is under 5% (not with no bars)", () => {
    const vs = Array.from({ length: 40 }, (_, i) => venue(`n${String(i)}`, "c", []));
    expect(coverage(vs, "spritz", 0).empty).toBe(true);
    expect(coverage([], "spritz", 0).empty).toBe(false);
  });
});
