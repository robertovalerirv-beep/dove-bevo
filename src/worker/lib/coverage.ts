// Coverage of the map per city (SPEC 7.9, ADR 0022): public bars with an active price.
import type { CellFile, Coverage, Place } from "../../shared/api-types";
import { distanceMeters } from "../../shared/venue";
import { getCoverageRows, isPublicBar } from "./db";
import { cellFile, placesFile } from "./venues";

/** The closest place of places.json, however far: a bar always belongs to some city. */
function nearestPlace(places: readonly Place[], lat: number, lon: number): number | null {
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

/**
 * Bars are stored with a city only when the static file had one within 15 km, and user bars never
 * had one. Whatever is missing is placed here by position (nearest place), so "no city" is left
 * only for a bar whose position cannot be found at all (ADR 0022).
 */
export async function buildCoverage(env: Env): Promise<Coverage> {
  const { rows, hidden, users } = await getCoverageRows(env.DB);
  const approved = new Set(users.keys());
  let places: Place[] | null = null;
  const nearest = async (lat: number, lon: number) =>
    nearestPlace((places ??= await placesFile(env)), lat, lon);
  const files = new Map<string, Promise<CellFile | null>>();
  const position = async (key: string, cell: string) => {
    const user = users.get(key);
    if (user) return user;
    const file = await (files.get(cell) ?? files.set(cell, cellFile(env, cell)).get(cell));
    const bar = file?.v.find((v) => v[0] === key);
    return bar ? { lat: bar[3], lon: bar[4] } : null;
  };

  const byCity = new Map<number | null, [bars: number, prices: number, day: string]>();
  let active = 0;
  for (const r of rows) {
    active += r.n;
    if (!isPublicBar(r.venue_key, approved, hidden)) continue;
    let city = r.city;
    if (city === null) {
      const at = await position(r.venue_key, r.cell);
      city = at ? await nearest(at.lat, at.lon) : null;
    }
    const c = byCity.get(city) ?? [0, 0, ""];
    c[0] += 1;
    c[1] += r.n;
    if (r.d > c[2]) c[2] = r.d;
    byCity.set(city, c);
  }

  const perCity = new Map<number, number>();
  for (const { lat, lon } of users.values()) {
    const city = await nearest(lat, lon);
    if (city !== null) perCity.set(city, (perCity.get(city) ?? 0) + 1);
  }

  const none = byCity.get(null) ?? [0, 0, ""];
  byCity.delete(null);
  const cities = [...byCity].map(([id, c]): [number, number, number, string] => [
    id as number,
    c[0],
    c[1],
    c[2],
  ]);
  cities.sort((a, b) => b[1] - a[1] || b[2] - a[2] || a[0] - b[0]);
  return {
    at: new Date().toISOString(),
    active,
    bars: none[0] + cities.reduce((s, c) => s + c[1], 0),
    prices: none[1] + cities.reduce((s, c) => s + c[2], 0),
    cities,
    none,
    users: [...perCity].sort((a, b) => a[0] - b[0]),
  };
}
