import { describe, expect, it } from "vitest";
import { cellMedian, coverage, isStale, medianOf, tierOf } from "../../src/app/lib/tiers";
import { bestPrice } from "../../src/shared/prices";
import type { PriceRow } from "../../src/shared/api-types";

const row = (
  key: string,
  cents: number,
  over: Partial<{ hh: 0 | 1; q: 0 | 1; drink: string }> = {},
): PriceRow => [key, over.drink ?? "spritz", over.hh ?? 0, cents, "2026-10-01", 0, over.q ?? 0];
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
    expect(cellMedian(four, "c", "spritz")).toBeNull();
    const five = [...four, venue("n5", "c", [row("n5", 700)])];
    expect(cellMedian(five, "c", "spritz")).toBe(503);
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
    expect(cellMedian([...base, ...noise], "c", "spritz")).toBe(600);
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
    expect(coverage(vs, ["spritz"])).toEqual({ withPrice: 2, total: 4, empty: false });
  });
  it("an empty zone is under 5% (not with no bars)", () => {
    const vs = Array.from({ length: 40 }, (_, i) => venue(`n${String(i)}`, "c", []));
    expect(coverage(vs, ["spritz"]).empty).toBe(true);
    expect(coverage([], ["spritz"]).empty).toBe(false);
  });
});

describe("MC-02 the pin shows the cheapest of the chosen drinks", () => {
  const both = venue("a", "c", [
    row("a", 700, { drink: "spritz" }),
    row("a", 600, { drink: "negroni" }),
  ]);
  it("picks the lowest price among the chosen drinks", () => {
    expect(bestPrice(both, ["spritz", "negroni"])?.[1]).toBe("negroni");
    expect(bestPrice(both, ["spritz"])?.[3]).toBe(700);
  });
  it("is undefined when the bar has none of them, and ignores quarantined prices", () => {
    expect(bestPrice(both, ["gin_tonic"])).toBeUndefined();
    const held = venue("b", "c", [row("b", 100, { drink: "negroni", q: 1 })]);
    expect(bestPrice(held, ["negroni"])).toBeUndefined();
  });
  it("prefers the normal price to a happy hour one of the same drink, as the pin did before", () => {
    const mixed = venue("c", "c", [row("c", 400, { hh: 1 }), row("c", 700, { hh: 0 })]);
    expect(bestPrice(mixed, ["spritz"])?.[3]).toBe(700);
  });
  it("counts a bar once for the coverage, however many of the drinks it has", () => {
    const vs = [both, venue("d", "c", [])];
    expect(coverage(vs, ["spritz", "negroni"])).toMatchObject({ withPrice: 1, total: 2 });
  });
});
