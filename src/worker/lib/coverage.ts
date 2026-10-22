// Coverage of the map per city (SPEC 7.9, ADR 0022): public bars with an active price.
import type { Coverage } from "../../shared/api-types";
import { COVERAGE_CACHE_MS } from "../config";
import { getCoverageRows, isPublicBar } from "./db";
import { nearestPlace, sortByLatitude, type SortedPlace } from "./nearest";
import { cellFile, placesFile } from "./venues";

/** places.json sorted by latitude, once per isolate and data version (the file never changes). */
let sortedCache: { version: string; places: SortedPlace[] } | null = null;
async function sortedPlaces(env: Env): Promise<SortedPlace[]> {
  const cached = sortedCache;
  if (cached?.version === env.DATA_VERSION) return cached.places;
  const places = sortByLatitude(await placesFile(env));
  if (places.length > 0) sortedCache = { version: env.DATA_VERSION, places };
  return places;
}

/** Cell files read at the same time: enough to overlap the waits, few enough to bound memory. */
const CELL_FETCHES = 8;

/**
 * Bars are stored with a city only when the static file had one within 15 km, and user bars never
 * had one. Whatever is missing is placed here by position (nearest place), so "no city" is left
 * only for a bar whose position cannot be found at all (ADR 0022). An OSM bar that is no longer in
 * the static file of its cell (a later import dropped it) is not on the map: its prices stay in D1
 * as history but it is not a bar with a price, and the admin list could not open it.
 */
export async function buildCoverage(env: Env): Promise<Coverage> {
  const { rows, hidden, users } = await getCoverageRows(env.DB);
  const approved = new Set(users.keys());

  // The static files of every cell that holds an OSM bar with a price, read in parallel; only the
  // positions of those bars are kept (ADR 0025).
  const wanted = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.venue_key.startsWith("u")) continue;
    if (!isPublicBar(r.venue_key, approved, hidden)) continue;
    wanted.set(r.cell, (wanted.get(r.cell) ?? new Set()).add(r.venue_key));
  }
  const found = new Map<string, Map<string, { lat: number; lon: number }>>();
  const cells = [...wanted.keys()];
  for (let i = 0; i < cells.length; i += CELL_FETCHES) {
    await Promise.all(
      cells.slice(i, i + CELL_FETCHES).map(async (cell) => {
        const keys = wanted.get(cell) ?? new Set<string>();
        const positions = new Map<string, { lat: number; lon: number }>();
        for (const v of (await cellFile(env, cell))?.v ?? [])
          if (keys.has(v[0])) positions.set(v[0], { lat: v[3], lon: v[4] });
        found.set(cell, positions);
      }),
    );
  }

  let places: SortedPlace[] | null = null;
  const nearest = async (lat: number, lon: number) =>
    nearestPlace((places ??= await sortedPlaces(env)), lat, lon);
  const position = (key: string, cell: string) =>
    users.get(key) ?? found.get(cell)?.get(key) ?? null;

  const members: Coverage["members"] = [];
  const byCity = new Map<number | null, [bars: number, prices: number, day: string]>();
  let active = 0;
  for (const r of rows) {
    active += r.n;
    if (!isPublicBar(r.venue_key, approved, hidden)) continue;
    if (!r.venue_key.startsWith("u") && !position(r.venue_key, r.cell)) continue; // gone from OSM
    let city = r.city;
    if (city === null) {
      const at = position(r.venue_key, r.cell);
      city = at ? await nearest(at.lat, at.lon) : null;
    }
    members.push([city ?? 0, r.venue_key, r.cell]);
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
    members,
  };
}

/** The last calculation: the admin page asks again and again, the D1 read quota is shared (ADR 0025). */
let snapshot: { at: number; value: Coverage } | null = null;

/** Forgets the stored figures: after an admin change the dashboard must not show the old ones. */
export const forgetCoverage = (): void => {
  snapshot = null;
};

/** The coverage, recomputed at most once every COVERAGE_CACHE_MS (and after an admin change). */
export async function coverageSnapshot(env: Env): Promise<Coverage> {
  if (snapshot && Date.now() - snapshot.at < COVERAGE_CACHE_MS) return snapshot.value;
  const value = await buildCoverage(env);
  snapshot = { at: Date.now(), value };
  return value;
}
