// OSM import core (SPEC 5.1, D-11): features from `osmium export` (GeoJSON, unique ids
// "n123"/"w456"/"r789") → static files. Pure: the CLI (build.mjs) does the I/O.
import type { CellFile, CellVenue, Place, VenueKind } from "../../src/shared/api-types.ts";
import { CELL_PRECISION, encodeGeohash } from "../../src/shared/geohash.ts";
import { fragmentName, significantWords } from "../../src/shared/venue.ts";
import { gzipSync } from "node:zlib";

export interface OsmFeature {
  type: "Feature";
  id?: string | number;
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown> | null;
}

export interface Limits {
  maxFiles: number;
  maxFileBytes: number;
  /** Largest search fragment, gzipped (ADR 0024). */
  maxFragmentGzip: number;
}

const DEFAULT_LIMITS: Limits = {
  maxFiles: 15_000,
  maxFileBytes: 1_000_000,
  maxFragmentGzip: 40 * 1024,
};
// Index = kind code (api-types). "cafe" keeps code 0 but is not imported (too many, little value).
const KINDS = ["cafe", "bar", "pub", "biergarten", "nightclub"];
const SKIPPED_KINDS = 1;
const PLACES = ["city", "town"];
const MAX_NAME = 120;
const CITY_RADIUS_KM = 15;
// Generous box around the Geofabrik Italy extract (islands, San Marino, Vatican, borders).
const ITALY = { south: 35, west: 6, north: 47.5, east: 19 };
const GRID = 0.25; // degrees; ≥ 15 km in latitude and in longitude at Italian latitudes

export class ImportError extends Error {}

interface Venue {
  key: string;
  name: string;
  kind: VenueKind;
  lat: number;
  lon: number;
  addr: string;
}

interface City {
  id: number;
  name: string;
  lat: number;
  lon: number;
  bars: number;
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

function text(tags: Record<string, unknown>, key: string): string {
  const value = tags[key];
  return typeof value === "string" ? value.trim() : "";
}

function validate(kind: string, key: string, name: string, lat: number, lon: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon))
    throw new ImportError(`${kind} ${key}: no coordinates`);
  if (lat < ITALY.south || lat > ITALY.north || lon < ITALY.west || lon > ITALY.east) {
    throw new ImportError(
      `${kind} ${key}: coordinates outside Italy (${String(lat)}, ${String(lon)})`,
    );
  }
  if (name.length > MAX_NAME)
    throw new ImportError(`${kind} ${key}: name longer than ${String(MAX_NAME)}`);
}

/** Centroid of the largest outer ring (shoelace); vertex mean when the area is zero. */
export function centroid(geometry: {
  type: string;
  coordinates: unknown;
}): [number, number] | null {
  if (geometry.type === "Point") {
    const [lon, lat] = geometry.coordinates as [number, number];
    return [lat, lon];
  }
  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates as number[][][]]
      : geometry.type === "MultiPolygon"
        ? (geometry.coordinates as number[][][][])
        : [];
  let best: [number, number] | null = null;
  let bestArea = -1;
  for (const polygon of polygons) {
    const ring = polygon[0] ?? [];
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0 = 0, y0 = 0] = ring[i] ?? [];
      const [x1 = 0, y1 = 0] = ring[i + 1] ?? [];
      const cross = x0 * y1 - x1 * y0;
      area += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
    if (Math.abs(area) > bestArea && ring.length > 0) {
      bestArea = Math.abs(area);
      if (area !== 0) {
        best = [cy / (3 * area), cx / (3 * area)];
      } else {
        const n = ring.length;
        best = [
          ring.reduce((s, p) => s + (p[1] ?? 0), 0) / n,
          ring.reduce((s, p) => s + (p[0] ?? 0), 0) / n,
        ];
      }
    }
  }
  return best;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(a));
}

const gridKey = (i: number, j: number) => `${String(i)}:${String(j)}`;

function nearestCity(grid: Map<string, City[]>, lat: number, lon: number): City | null {
  const i = Math.floor(lat / GRID);
  const j = Math.floor(lon / GRID);
  let best: City | null = null;
  let bestKm = CITY_RADIUS_KM;
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      for (const city of grid.get(gridKey(i + di, j + dj)) ?? []) {
        const km = distanceKm(lat, lon, city.lat, city.lon);
        if (km <= bestKm) {
          best = city;
          bestKm = km;
        }
      }
    }
  }
  return best;
}

/** osmium exports areas as "a<n>": n = 2·way id, or 2·relation id + 1. Back to "w…"/"r…". */
function osmKey(id: string): string {
  const area = /^a(\d+)$/.exec(id);
  if (!area?.[1]) return id;
  const n = BigInt(area[1]);
  return n % 2n === 0n ? `w${String(n / 2n)}` : `r${String((n - 1n) / 2n)}`;
}

export function licenseText(dataVersion: string): string {
  return [
    "Dove bevo — bar data",
    "",
    `Derived from OpenStreetMap data (extract ${dataVersion}).`,
    "© OpenStreetMap contributors. Available under the Open Database License (ODbL) 1.0:",
    "https://opendatacommons.org/licenses/odbl/1-0/ — https://www.openstreetmap.org/copyright",
    "",
    "These files contain only OpenStreetMap data. Prices are a separate database and are never",
    "stored in these files (ADR 0003).",
    "",
  ].join("\n");
}

/** A bar in a search fragment: [key, name, lat, lon, OSM id of its city, 0 when none]. */
export type SearchEntry = [string, string, number, number, number];

/**
 * Search index (SPEC 5.1, ADR 0024): `s/<prefix>.json`, the bars that have a word starting with the
 * 2-character prefix; prefixes whose fragment is over the limit are split in 3 characters and listed
 * in `s/index.json`. Words and normalisation come from src/shared/venue.ts, like in the client.
 */
export function buildSearchIndex(
  entries: SearchEntry[],
  maxFragmentGzip = DEFAULT_LIMITS.maxFragmentGzip,
): Map<string, string> {
  const groups = new Map<string, Map<string, SearchEntry>>();
  const add = (prefix: string, entry: SearchEntry) => {
    const group = groups.get(prefix) ?? new Map<string, SearchEntry>();
    group.set(entry[0], entry);
    groups.set(prefix, group);
  };
  const words = new Map<string, Set<string>>();
  for (const entry of entries) {
    for (const word of significantWords(entry[1])) {
      const p2 = fragmentName(word.slice(0, 2));
      add(p2, entry);
      const list = words.get(p2) ?? new Set<string>();
      list.add(word);
      words.set(p2, list);
    }
  }
  const size = (rows: Map<string, SearchEntry>) =>
    gzipSync(JSON.stringify([...rows.values()])).length;
  const files = new Map<string, string>();
  const split: string[] = [];
  const write = (name: string, rows: Map<string, SearchEntry>) => {
    const sorted = [...rows.values()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const content = JSON.stringify(sorted);
    const gz = gzipSync(content).length;
    if (gz > maxFragmentGzip)
      throw new ImportError(`s/${name}.json too large: ${String(gz)} bytes gzip`);
    files.set(`s/${name}.json`, content);
  };
  for (const [p2, rows] of [...groups].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (size(rows) <= maxFragmentGzip) {
      write(p2, rows);
      continue;
    }
    split.push(p2);
    const by3 = new Map<string, Map<string, SearchEntry>>();
    for (const entry of rows.values()) {
      for (const word of significantWords(entry[1])) {
        if (fragmentName(word.slice(0, 2)) !== p2) continue;
        const p3 = fragmentName(word.slice(0, 3));
        const group = by3.get(p3) ?? new Map<string, SearchEntry>();
        group.set(entry[0], entry);
        by3.set(p3, group);
      }
    }
    for (const [p3, group] of by3) write(p3, group);
  }
  files.set("s/index.json", JSON.stringify(split));
  return files;
}

/** Builds every output file, keyed by path relative to `data/<DATA_VERSION>/`. */
export function buildDataset(
  features: Iterable<OsmFeature>,
  dataVersion: string,
  limits: Partial<Limits> = {},
): Map<string, string> {
  const { maxFiles, maxFileBytes, maxFragmentGzip } = { ...DEFAULT_LIMITS, ...limits };
  const venues: Venue[] = [];
  const cities: City[] = [];

  for (const feature of features) {
    const tags = feature.properties ?? {};
    const key = osmKey(String(feature.id ?? ""));
    const name = text(tags, "name");
    if (!feature.geometry || !/^[nwr]\d+$/.test(key) || !name) continue;
    const point = centroid(feature.geometry); // null for open ways: not a place
    if (!point) continue;
    const [lat, lon] = point;
    const place = text(tags, "place");
    const kind = KINDS.indexOf(text(tags, "amenity"));
    if (key.startsWith("n") && PLACES.includes(place)) {
      validate("place", key, name, lat, lon);
      cities.push({ id: Number(key.slice(1)), name, lat: round5(lat), lon: round5(lon), bars: 0 });
    } else if (kind >= SKIPPED_KINDS) {
      validate("bar", key, name, lat, lon);
      const street = text(tags, "addr:street");
      const addr = street ? `${street} ${text(tags, "addr:housenumber")}`.trim() : "";
      venues.push({ key, name, kind: kind as VenueKind, lat: round5(lat), lon: round5(lon), addr });
    }
  }

  const grid = new Map<string, City[]>();
  for (const city of cities) {
    const k = gridKey(Math.floor(city.lat / GRID), Math.floor(city.lon / GRID));
    grid.set(k, [...(grid.get(k) ?? []), city]);
  }

  const cells = new Map<string, { cities: City[]; rows: [Venue, City | null][] }>();
  for (const venue of venues) {
    const city = nearestCity(grid, venue.lat, venue.lon);
    if (city) city.bars++;
    const cell = encodeGeohash(venue.lat, venue.lon, CELL_PRECISION);
    const entry = cells.get(cell) ?? { cities: [], rows: [] };
    if (city && !entry.cities.includes(city)) entry.cities.push(city);
    entry.rows.push([venue, city]);
    cells.set(cell, entry);
  }

  const files = new Map<string, string>();
  for (const [cell, { cities: table, rows }] of cells) {
    rows.sort(([a], [b]) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const file: CellFile = {
      c: table.map((c) => [c.id, c.name]),
      v: rows.map(([v, c]): CellVenue => [
        v.key,
        v.name,
        v.kind,
        v.lat,
        v.lon,
        v.addr,
        c ? table.indexOf(c) : -1,
      ]),
    };
    files.set(`v/${cell}.json`, JSON.stringify(file));
  }
  const places: Place[] = cities
    .sort((a, b) => b.bars - a.bars || a.name.localeCompare(b.name, "it"))
    .map((c) => [c.id, c.name, c.lat, c.lon, c.bars]);
  files.set("places.json", JSON.stringify(places));
  const searchEntries: SearchEntry[] = [];
  for (const { rows } of cells.values())
    for (const [v, c] of rows) searchEntries.push([v.key, v.name, v.lat, v.lon, c ? c.id : 0]);
  for (const [path, content] of buildSearchIndex(searchEntries, maxFragmentGzip))
    files.set(path, content);
  files.set("LICENSE.txt", licenseText(dataVersion));

  if (files.size > maxFiles) {
    throw new ImportError(`${String(files.size)} files, more than ${String(maxFiles)}`);
  }
  for (const [path, content] of files) {
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > maxFileBytes) throw new ImportError(`${path} too large: ${String(bytes)} bytes`);
  }
  return files;
}
