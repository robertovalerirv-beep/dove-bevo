// Client data: static OSM cells + live prices, cached for the visit (SPEC 5.4).
// Requests carry only cell ids and bar keys, never the user's position (SPEC 14).
import type {
  CellFile,
  CellPrices,
  Place,
  PriceRow,
  VenueKind,
  VenuePrices,
} from "../../shared/api-types";

export const DATA_VERSION = import.meta.env.VITE_DATA_VERSION ?? "fixture";

export interface Venue {
  key: string;
  name: string;
  kind: VenueKind;
  lat: number;
  lon: number;
  addr: string;
  city: string;
  cell: string;
  prices: PriceRow[];
}

const cells = new Map<string, Promise<Venue[]>>();

async function getJson<T>(url: string, fallback: T): Promise<T> {
  const response = await fetch(url);
  if (response.status === 404) return fallback;
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  return (await response.json()) as T;
}

async function fetchCell(cell: string): Promise<Venue[]> {
  const [file, prices] = await Promise.all([
    getJson<CellFile>(`/data/${DATA_VERSION}/v/${cell}.json`, { c: [], v: [] }),
    getJson<CellPrices>(`/api/prices/${cell}`, { p: [], u: [], pend: [] }),
  ]);
  const byKey = new Map<string, PriceRow[]>();
  for (const row of prices.p) byKey.set(row[0], [...(byKey.get(row[0]) ?? []), row]);
  const osm = file.v.map(([key, name, kind, lat, lon, addr, ci]) => ({
    key,
    name,
    kind,
    lat,
    lon,
    addr,
    city: file.c[ci]?.[1] ?? "",
    cell,
    prices: byKey.get(key) ?? [],
  }));
  const user = prices.u.map(([key, name, kind, lat, lon]) => ({
    key,
    name,
    kind,
    lat,
    lon,
    addr: "",
    city: "",
    cell,
    prices: byKey.get(key) ?? [],
  }));
  return [...osm, ...user];
}

/** Venues of a cell; the promise is kept so each cell is downloaded once per visit. */
export function loadCell(cell: string): Promise<Venue[]> {
  let pending = cells.get(cell);
  if (!pending) {
    pending = fetchCell(cell);
    pending.catch(() => cells.delete(cell)); // allow a retry after a network error
    cells.set(cell, pending);
  }
  return pending;
}

let places: Promise<Place[]> | null = null;

/** places.json, loaded at the first search (SPEC 5.1). */
export function loadPlaces(): Promise<Place[]> {
  if (!places) {
    places = getJson<Place[]>(`/data/${DATA_VERSION}/places.json`, []);
    places.catch(() => (places = null)); // retry at the next search after a network error
  }
  return places;
}

export const loadVenuePrices = (key: string) =>
  getJson<VenuePrices>(`/api/venues/${encodeURIComponent(key)}/prices`, { p: [], h: [] });

/** Price shown for a drink and size: the normal one, else the happy-hour one (D-13). Active only. */
export function shownPrice(venue: Venue, drink: string, size: number): PriceRow | undefined {
  const rows = venue.prices.filter((p) => p[1] === drink && p[2] === size && p[7] === 0);
  return rows.find((p) => p[3] === 0) ?? rows.find((p) => p[3] === 1);
}
