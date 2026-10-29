import { describe, expect, it } from "vitest";
import { medianOf } from "../../src/shared/prices";
import { CELL_PATTERN, OSM_KEY_PATTERN, VENUE_KEY_PATTERN } from "../../src/shared/venue";

// One definition of the cell, bar key and median shared by the Worker and the app (audit 28/10/2026).

describe("CELL_PATTERN (geohash5)", () => {
  it.each(["u0nd9", "spzzz", "00000", "bcdef"])("accepts %s", (cell) => {
    expect(CELL_PATTERN.test(cell)).toBe(true);
  });
  it.each(["", "u0nd", "u0nd99", "U0ND9", "u0ndi", "u0ndl", "u0ndo", "u0nda", "u0nd9\n", " u0nd9"])(
    "refuses %j",
    (cell) => {
      expect(CELL_PATTERN.test(cell)).toBe(false);
    },
  );
});

describe("VENUE_KEY_PATTERN (OSM n/w/r or user u)", () => {
  it.each(["n1", "w549495264", "r789", "u12", "n123456789012345"])("accepts %s", (key) => {
    expect(VENUE_KEY_PATTERN.test(key)).toBe(true);
  });
  it.each(["", "n", "n0", "u007", "x1", "N1", "n1234567890123456", "n1 ", "n1\n", "n-1", "n1.5"])(
    "refuses %j",
    (key) => {
      expect(VENUE_KEY_PATTERN.test(key)).toBe(false);
    },
  );
});

describe("OSM_KEY_PATTERN (no user bars)", () => {
  it("accepts n/w/r keys and refuses u", () => {
    for (const key of ["n1", "w2", "r3"]) expect(OSM_KEY_PATTERN.test(key)).toBe(true);
    for (const key of ["u1", "n0", "n01"]) expect(OSM_KEY_PATTERN.test(key)).toBe(false);
  });
});

describe("medianOf (shared)", () => {
  it("odd, even, single, empty and unsorted input", () => {
    expect(medianOf([500, 700, 600])).toBe(600);
    expect(medianOf([500, 600, 700, 800])).toBe(650);
    expect(medianOf([750])).toBe(750);
    expect(medianOf([])).toBe(0);
    expect(medianOf([900, 100, 500, 300, 700])).toBe(500);
  });
  it("does not change the array it is given", () => {
    const values = [3, 1, 2];
    medianOf(values);
    expect(values).toEqual([3, 1, 2]);
  });
});
