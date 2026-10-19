import { describe, expect, it } from "vitest";
import type { Place } from "../../src/shared/api-types";
import { distanceMeters } from "../../src/shared/venue";
import { nearestPlace, sortByLatitude } from "../../src/worker/lib/nearest";

// ADR 0025 (C3): the nearest place by latitude walk must answer exactly like a scan of all places.
function scan(places: readonly Place[], lat: number, lon: number): number | null {
  let best: number | null = null;
  let bestMeters = Infinity;
  for (const [id, , pLat, pLon] of places) {
    const meters = distanceMeters(lat, lon, pLat, pLon);
    if (meters < bestMeters) {
      bestMeters = meters;
      best = id;
    }
  }
  return best;
}

// A small deterministic generator: the same places in every run.
let seed = 12345;
const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;

describe("nearestPlace", () => {
  const places: Place[] = Array.from({ length: 400 }, (_, i) => [
    1000 + i,
    `Place ${String(i)}`,
    36 + random() * 11,
    7 + random() * 11,
    0,
  ]);
  const sorted = sortByLatitude(places);

  it("is the same place as a scan of all places, for 2000 random points", () => {
    for (let i = 0; i < 2000; i++) {
      const lat = 35.2 + random() * 12;
      const lon = 6.5 + random() * 12.1;
      expect(nearestPlace(sorted, lat, lon), `${String(lat)},${String(lon)}`).toBe(
        scan(places, lat, lon),
      );
    }
  });

  it("answers even when the nearest place is far away, at the edges and on an empty list", () => {
    expect(nearestPlace(sorted, 35.2, 6.5)).toBe(scan(places, 35.2, 6.5));
    expect(nearestPlace(sorted, 47.2, 18.6)).toBe(scan(places, 47.2, 18.6));
    expect(nearestPlace([], 45, 9)).toBeNull();
  });

  it("two equally near places: the first in the file wins, as in a plain scan", () => {
    const twins: Place[] = [
      [2, "B", 45, 9, 0],
      [1, "A", 45, 9, 0],
    ];
    expect(nearestPlace(sortByLatitude(twins), 45.1, 9.1)).toBe(scan(twins, 45.1, 9.1));
    expect(nearestPlace(sortByLatitude(twins), 45.1, 9.1)).toBe(2);
  });

  it("looks at few places: a point in the middle of a dense list measures a small part of it", () => {
    let measured = 0;
    const counted = sorted.map((s) => ({
      get place() {
        measured++;
        return s.place;
      },
      index: s.index,
    }));
    nearestPlace(counted, 41.9, 12.5);
    expect(measured).toBeLessThan(sorted.length * 3); // each visited place is read a few times
  });
});
