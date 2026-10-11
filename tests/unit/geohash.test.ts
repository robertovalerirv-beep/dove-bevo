import { describe, expect, it } from "vitest";
import {
  CELL_PRECISION,
  MAX_VISIBLE_CELLS,
  encodeGeohash,
  visibleCells,
} from "../../src/shared/geohash";

describe("geohash encoder (M1-01)", () => {
  it("encodes known vectors", () => {
    expect(encodeGeohash(45.4642, 9.19, 5)).toBe("u0nd9");
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe("u4pruydqqvj");
    expect(encodeGeohash(41.9028, 12.4964, 5)).toBe("sr2yk");
  });

  it("handles the edges of the world", () => {
    expect(encodeGeohash(-90, -180, 5)).toBe("00000");
    expect(encodeGeohash(90, 180, 5)).toBe("zzzzz");
    expect(encodeGeohash(0, 0, 5)).toBe("s0000");
    expect(encodeGeohash(-0.0001, -0.0001, 5)).toBe("7zzzz");
  });

  it("uses 5-character cells", () => {
    expect(CELL_PRECISION).toBe(5);
    expect(MAX_VISIBLE_CELLS).toBe(12);
  });
});

describe("visible cells (M1-01)", () => {
  it("returns the single cell of a small view", () => {
    expect(visibleCells({ south: 45.464, west: 9.19, north: 45.465, east: 9.191 })).toEqual([
      "u0nd9",
    ]);
  });

  it("covers every cell of the view without duplicates", () => {
    const cells = visibleCells({ south: 45.44, west: 9.15, north: 45.5, east: 9.24 });
    expect(cells).not.toBeNull();
    expect(new Set(cells).size).toBe(cells?.length);
    expect(cells?.length).toBeLessThanOrEqual(12);
    for (const [lat, lon] of [
      [45.44, 9.15],
      [45.5, 9.24],
      [45.47, 9.2],
    ] as const) {
      expect(cells).toContain(encodeGeohash(lat, lon, 5));
    }
  });

  it("returns null above 12 cells", () => {
    expect(visibleCells({ south: 45.3, west: 9.0, north: 45.6, east: 9.4 })).toBeNull();
  });
});
