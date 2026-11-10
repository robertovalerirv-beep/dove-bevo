import { Hono } from "hono";
import { encodeGeohash, visibleCells } from "../../shared/geohash";
import { distanceMeters, DUPLICATE_METERS, ITALY, OSM_KEY_PATTERN } from "../../shared/venue";
import { sameName } from "../lib/same-name";
import { ApiError } from "../lib/errors";
import { cellFile } from "../lib/venues";
import { EvidenceDay, HTTPS, MobileCell, MobileDrink } from "./mobile-price-catalog";
import type { AppEnv } from "../types";

type Registry = {
  venue_key: string;
  cell: string;
  name: string;
  kind: number;
  lat: number;
  lon: number;
  address: string | null;
  city: string;
  country: string;
  identity_url: string;
  identity_kind: string;
  identity_fingerprint: string | null;
  identity_text_sha256: string | null;
  identity_geo_url: string | null;
  identity_geo_text_sha256: string | null;
  identity_geo_hash_basis: "raw_utf8" | "html_text_v1" | null;
};
type Venue = {
  key: string;
  cell: string;
  name: string;
  kind: number;
  lat: number;
  lon: number;
  address: string | null;
  city: string | null;
  country: string;
  identity_url: string;
  identity_kind: "osm" | "owner_verified";
};
type Evidence = {
  source_id: string;
  source_url: string;
  source_text_sha256: string;
  source_checked_on: string;
};
type OfferRow = Evidence & {
  id: string;
  venue_key: string;
  name: string;
  category: string | null;
  serving_label: string | null;
  serving_ml: number | null;
  amount_minor: number;
  currency: string;
  currency_exponent: number;
  price_context: string;
  condition_text: string | null;
};
type FeeRow = Evidence & {
  id: string;
  label: string;
  fee_kind: "fixed" | "percent";
  basis: string;
  amount_minor: number | null;
  currency: string | null;
  currency_exponent: number | null;
  rate_bps: number | null;
  applicability: string;
  condition_text: string | null;
};
type CoverageRow = Evidence & {
  venue_key: string;
  status: "documented_partial" | "explicit_no_fee";
  fee_count: number;
};
type Candidate = { venue_key: string; n: number };
type Nearby = {
  name: string;
  lat: number;
  lon: number;
  address?: string | null;
  venue_key?: string;
};
const OWNER_KEY_PATTERN = /^m[0-9a-f]{24}$/;

const SOURCE = "s.id AS source_id, s.source_url, s.source_text_sha256, s.source_checked_on";
const APPROVED =
  " JOIN mobile_menu_v2_sources s ON s.id = o.source_id" +
  " AND s.venue_key = o.venue_key AND s.cell = o.cell AND s.use_review_status = 'approved'";
const PUBLIC =
  " NOT EXISTS (SELECT 1 FROM venues_hidden h WHERE h.venue_key = o.venue_key)" +
  " AND NOT EXISTS (SELECT 1 FROM mobile_venues_moderation m WHERE m.venue_key = o.venue_key)";
const OFFER_COLS =
  "o.id, o.venue_key, o.name, o.category, o.serving_label, o.serving_ml," +
  " o.amount_minor, o.currency, o.currency_exponent, o.price_context, o.condition_text, " +
  SOURCE;
const FEE_COLS =
  "f.id, f.label, f.fee_kind, f.basis, f.amount_minor, f.currency," +
  " f.currency_exponent, f.rate_bps, f.applicability, f.condition_text, " +
  SOURCE;
// The app's Birra media map price must not use a cheaper small draft serving.
// Keep the full named menu (and the legacy website price path) unchanged.
const SERVING_WORDS =
  "' ' || REPLACE(REPLACE(REPLACE(REPLACE(LOWER(COALESCE(o.serving_label,''))," +
  " '/', ' '), '-', ' '), ',', ' '), '.', ' ') || ' '";
const hasServingWord = (word: string) => "INSTR(" + SERVING_WORDS + ", ' " + word + " ') > 0";
const lacksServingWord = (word: string) => "INSTR(" + SERVING_WORDS + ", ' " + word + " ') = 0";
const MEDIUM_DRAFT =
  "(o.serving_ml BETWEEN 400 AND 600 OR" +
  " (o.serving_ml IS NULL AND (" +
  [hasServingWord("media"), hasServingWord("medium")].join(" OR ") +
  ") AND " +
  ["grande", "large", "pint"].map(lacksServingWord).join(" AND ") +
  ")) AND " +
  ["piccola", "piccolo", "small", "mini"].map(lacksServingWord).join(" AND ");

function source(row: Evidence) {
  if (
    !HTTPS.safeParse(row.source_url).success ||
    !EvidenceDay.safeParse(row.source_checked_on).success
  )
    throw new ApiError("busy");
  return {
    id: row.source_id,
    url: row.source_url,
    text_sha256: row.source_text_sha256,
    checked_on: row.source_checked_on,
  };
}
function offer(row: OfferRow) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    serving: { label: row.serving_label, ml: row.serving_ml },
    amount_minor: row.amount_minor,
    currency: row.currency,
    currency_exponent: row.currency_exponent,
    context: { kind: row.price_context, condition: row.condition_text },
    source: source(row),
  };
}
function fee(row: FeeRow) {
  return {
    id: row.id,
    label: row.label,
    kind: row.fee_kind,
    basis: row.basis,
    amount_minor: row.amount_minor,
    currency: row.currency,
    currency_exponent: row.currency_exponent,
    rate_bps: row.rate_bps,
    applicability: row.applicability,
    condition: row.condition_text,
    source: source(row),
  };
}
function coverage(row: CoverageRow | null, feeCount: number) {
  if (!row) return { status: "unknown" as const, source: null };
  if (
    (row.status === "documented_partial" && feeCount === 0) ||
    (row.status === "explicit_no_fee" && feeCount !== 0)
  )
    return { status: "unknown" as const, source: null };
  return { status: row.status, source: source(row) };
}
function queryCell(value: string | undefined): string {
  const parsed = MobileCell.safeParse(value);
  if (!parsed.success) throw new ApiError("bad_request");
  return parsed.data;
}
function queryKey(value: string | undefined): string {
  if (!value || !(OSM_KEY_PATTERN.test(value) || OWNER_KEY_PATTERN.test(value)))
    throw new ApiError("bad_request");
  return value;
}
function cursor(value: string | undefined): string {
  if (value === undefined) return "";
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value)) throw new ApiError("bad_request");
  return value;
}
function limit(value: string | undefined): number {
  if (value === undefined) return 100;
  if (!/^[1-9][0-9]{0,2}$/.test(value)) throw new ApiError("bad_request");
  const n = Number(value);
  if (n > 100) throw new ApiError("bad_request");
  return n;
}
function registryVenue(row: Registry): Venue {
  if (encodeGeohash(row.lat, row.lon, 5) !== row.cell) throw new ApiError("busy");
  let identityKind: Venue["identity_kind"];
  if (row.identity_kind === "osm") {
    identityKind = "osm";
    const type = { n: "node", w: "way", r: "relation" }[row.venue_key[0] as "n" | "w" | "r"];
    if (
      !OSM_KEY_PATTERN.test(row.venue_key) ||
      row.country === "IT" ||
      row.identity_fingerprint !== null ||
      row.identity_text_sha256 !== null ||
      row.identity_geo_url !== null ||
      row.identity_geo_text_sha256 !== null ||
      row.identity_geo_hash_basis !== null ||
      row.identity_url !== "https://www.openstreetmap.org/" + type + "/" + row.venue_key.slice(1)
    )
      throw new ApiError("busy");
  } else if (row.identity_kind === "owner_verified") {
    identityKind = "owner_verified";
    if (
      row.country !== "IT" ||
      !OWNER_KEY_PATTERN.test(row.venue_key) ||
      !row.identity_fingerprint ||
      !/^[0-9a-f]{64}$/.test(row.identity_fingerprint) ||
      row.venue_key !== "m" + row.identity_fingerprint.slice(0, 24) ||
      !row.address ||
      row.address.trim().length < 3 ||
      !row.identity_text_sha256 ||
      !/^[0-9a-f]{64}$/.test(row.identity_text_sha256) ||
      !row.identity_geo_url ||
      !HTTPS.safeParse(row.identity_geo_url).success ||
      !row.identity_geo_text_sha256 ||
      !/^[0-9a-f]{64}$/.test(row.identity_geo_text_sha256) ||
      !row.identity_geo_hash_basis ||
      !HTTPS.safeParse(row.identity_url).success ||
      row.identity_url.startsWith("https://www.openstreetmap.org/") ||
      row.lat < ITALY.south ||
      row.lat > ITALY.north ||
      row.lon < ITALY.west ||
      row.lon > ITALY.east
    )
      throw new ApiError("busy");
  } else throw new ApiError("busy");
  return {
    key: row.venue_key,
    cell: row.cell,
    name: row.name,
    kind: row.kind,
    lat: row.lat,
    lon: row.lon,
    address: row.address,
    city: row.city,
    country: row.country,
    identity_url: row.identity_url,
    identity_kind: identityKind,
  };
}
function addressKey(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}
function duplicateCells(place: Venue): string[] {
  // A venue near a geohash edge may have an existing neighbour in the next cell.
  const latSpan = DUPLICATE_METERS / 110_000;
  const lonSpan = latSpan / Math.cos((place.lat * Math.PI) / 180);
  const cells = visibleCells({
    south: place.lat - latSpan,
    north: place.lat + latSpan,
    west: place.lon - lonSpan,
    east: place.lon + lonSpan,
  });
  if (!cells || !cells.includes(place.cell)) throw new ApiError("busy");
  return cells;
}
function nearbyDuplicate(
  place: Venue,
  originals: readonly Awaited<ReturnType<typeof cellFile>>[],
  users: readonly Nearby[],
  peers: readonly Nearby[],
): boolean {
  const close = (lat: number, lon: number) =>
    distanceMeters(place.lat, place.lon, lat, lon) < DUPLICATE_METERS;
  const matches = (candidate: Nearby) =>
    close(candidate.lat, candidate.lon) &&
    (sameName(candidate.name, place.name) ||
      (!!place.address &&
        !!candidate.address &&
        addressKey(candidate.address) === addressKey(place.address)));
  return (
    originals.some((original) =>
      original?.v.some((row) =>
        matches({
          name: row[1],
          lat: row[3],
          lon: row[4],
          address: row[5],
        }),
      ),
    ) ||
    users.some(matches) ||
    peers.some((peer) => peer.venue_key !== place.key && matches(peer))
  );
}
async function assertOwnerUnconflicted(env: Env, place: Venue): Promise<void> {
  if (place.identity_kind !== "owner_verified") return;
  const cells = duplicateCells(place);
  const marks = cells.map(() => "?").join(",");
  const [originals, users, peers] = await Promise.all([
    Promise.all(cells.map((cell) => cellFile(env, cell))),
    env.DB.prepare(
      "SELECT name,lat,lon FROM venues_user WHERE cell IN (" +
        marks +
        ") AND status IN ('approved','pending')",
    )
      .bind(...cells)
      .all<Nearby>(),
    env.DB.prepare(
      "SELECT venue_key,name,lat,lon,address FROM mobile_menu_v2_venues" +
        " WHERE cell IN (" +
        marks +
        ") AND identity_kind='owner_verified'",
    )
      .bind(...cells)
      .all<Nearby>(),
  ]);
  if (nearbyDuplicate(place, originals, users.results, peers.results))
    throw new ApiError("not_found");
}

function staticVenue(
  file: Awaited<ReturnType<typeof cellFile>>,
  key: string,
  cell: string,
): Venue | null {
  if (!OSM_KEY_PATTERN.test(key)) return null;
  const row = file?.v.find((item) => item[0] === key);
  if (!row) return null;
  const osmType = { n: "node", w: "way", r: "relation" }[key[0] as "n" | "w" | "r"];
  return {
    key,
    cell,
    name: row[1],
    kind: row[2],
    lat: row[3],
    lon: row[4],
    address: row[5] || null,
    city: file?.c[row[6]]?.[1] ?? null,
    country: "IT",
    identity_url: "https://www.openstreetmap.org/" + osmType + "/" + key.slice(1),
    identity_kind: "osm",
  };
}
/** Resolve an Italian OSM identity only from the current published static cell. */
export async function currentStaticMenuVenue(
  env: Env,
  key: string,
  cell: string,
): Promise<Venue | null> {
  const place = staticVenue(await cellFile(env, cell), key, cell);
  return place && encodeGeohash(place.lat, place.lon, 5) === cell ? place : null;
}

async function registeredVenue(env: Env, key: string, cell: string): Promise<Venue | null> {
  const registry = await env.DB.prepare(
    "SELECT venue_key,cell,name,kind,lat,lon,address,city,country,identity_kind,identity_url,identity_fingerprint,identity_text_sha256,identity_geo_url,identity_geo_text_sha256,identity_geo_hash_basis" +
      " FROM mobile_menu_v2_venues WHERE venue_key=?1 AND cell=?2",
  )
    .bind(key, cell)
    .first<Registry>();
  if (!registry) return null;
  const place = registryVenue(registry);
  await assertOwnerUnconflicted(env, place);
  return place;
}
async function venue(env: Env, key: string, cell: string): Promise<Venue> {
  const registered = await registeredVenue(env, key, cell);
  if (registered) return registered;
  const original = staticVenue(await cellFile(env, cell), key, cell);
  if (!original) throw new ApiError("not_found");
  return original;
}
/** Customer observations require a vetted registry or a currently published Italian
 * static OSM venue with an approved, active named-menu offer at the exact key/cell.
 * Static identity alone never enables v2 contributions.
 */
export async function resolveContributableMenuVenue(
  env: Env,
  key: string,
  cell: string,
): Promise<Venue> {
  const registered = await registeredVenue(env, key, cell);
  const place = registered ?? (await currentStaticMenuVenue(env, key, cell));
  if (!place || (await blocked(env.DB, key))) throw new ApiError("not_found");
  if (!registered) {
    const approved = await env.DB.prepare(
      "SELECT 1 AS present FROM mobile_menu_v2_offers o" +
        " JOIN mobile_menu_v2_sources s ON s.id=o.source_id" +
        " AND s.venue_key=o.venue_key AND s.cell=o.cell AND s.use_review_status='approved'" +
        " WHERE o.venue_key=?1 AND o.cell=?2 AND o.status='active' LIMIT 1",
    )
      .bind(key, cell)
      .first<{ present: number }>();
    if (!approved) throw new ApiError("not_found");
  }
  return place;
}
async function blocked(db: D1Database, key: string): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 AS blocked WHERE EXISTS (SELECT 1 FROM venues_hidden WHERE venue_key=?1)" +
        " OR EXISTS (SELECT 1 FROM mobile_venues_moderation WHERE venue_key=?1)",
    )
    .bind(key)
    .first<{ blocked: number }>();
  return row !== null;
}
async function feeCoverage(db: D1Database, key: string, cell: string) {
  return db
    .prepare(
      "SELECT c.venue_key,c.status," +
        SOURCE +
        "," +
        " (SELECT COUNT(*) FROM mobile_menu_v2_fees f" +
        " JOIN mobile_menu_v2_sources fs ON fs.id=f.source_id AND fs.venue_key=f.venue_key" +
        " AND fs.cell=f.cell AND fs.use_review_status='approved'" +
        " WHERE f.venue_key=c.venue_key AND f.cell=c.cell AND f.status='active') AS fee_count" +
        " FROM mobile_menu_v2_fee_coverage c JOIN mobile_menu_v2_sources s" +
        " ON s.id=c.source_id AND s.venue_key=c.venue_key AND s.cell=c.cell" +
        " AND s.use_review_status='approved' WHERE c.venue_key=?1 AND c.cell=?2",
    )
    .bind(key, cell)
    .first<CoverageRow>();
}
const envelope = {
  schema_version: 2,
  coverage: { complete: false, basis: "verified_source_items_only" },
  price_scope: "menu_item_only",
};

export const mobileMenuV2 = new Hono<AppEnv>();

// A venue's entire named menu is retrievable via stable keyset pagination.
mobileMenuV2.get("/venues/:key", async (c) => {
  const key = queryKey(c.req.param("key"));
  const cell = queryCell(c.req.query("cell"));
  const after = cursor(c.req.query("after"));
  const pageSize = limit(c.req.query("limit"));
  const place = await venue(c.env, key, cell);
  if (await blocked(c.env.DB, key)) throw new ApiError("not_found");
  const [rows, count, feeRows, feeState] = await Promise.all([
    c.env.DB.prepare(
      "SELECT " +
        OFFER_COLS +
        " FROM mobile_menu_v2_offers o" +
        APPROVED +
        " WHERE o.venue_key=?1 AND o.cell=?2 AND o.status='active' AND o.id>?3" +
        " ORDER BY o.id LIMIT ?4",
    )
      .bind(key, cell, after, pageSize + 1)
      .all<OfferRow>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM mobile_menu_v2_offers o" +
        APPROVED +
        " WHERE o.venue_key=?1 AND o.cell=?2 AND o.status='active'",
    )
      .bind(key, cell)
      .first<{ n: number }>(),
    c.env.DB.prepare(
      "SELECT " +
        FEE_COLS +
        " FROM mobile_menu_v2_fees f" +
        " JOIN mobile_menu_v2_sources s ON s.id=f.source_id AND s.venue_key=f.venue_key" +
        " AND s.cell=f.cell AND s.use_review_status='approved'" +
        " WHERE f.venue_key=?1 AND f.cell=?2 AND f.status='active' ORDER BY f.id LIMIT 101",
    )
      .bind(key, cell)
      .all<FeeRow>(),
    feeCoverage(c.env.DB, key, cell),
  ]);
  if (feeRows.results.length > 100) throw new ApiError("busy");
  const slice = rows.results.slice(0, pageSize);
  return c.json(
    {
      ...envelope,
      venue: place,
      stored_offer_count: count?.n ?? 0,
      offers: slice.map(offer),
      next_after: rows.results.length > pageSize ? slice.at(-1)?.id : null,
      fees: feeRows.results.map(fee),
      fee_coverage: coverage(feeState, feeRows.results.length),
    },
    200,
    { "Cache-Control": "no-store" },
  );
});

// Bounded cell discovery lists only vetted active offers. Samples are base menu prices, not totals.
mobileMenuV2.get("/cells/:cell", async (c) => {
  const cell = queryCell(c.req.param("cell"));
  const after = c.req.query("after") === undefined ? "" : queryKey(c.req.query("after"));
  const requested = c.req.query("category");
  const requestedMany = c.req.query("categories");
  if (requested !== undefined && requestedMany !== undefined) throw new ApiError("bad_request");
  let code: string | null = null;
  let codes: string[] | null = null;
  if (requested !== undefined) {
    const parsed = MobileDrink.safeParse(requested);
    if (!parsed.success) throw new ApiError("bad_request");
    code = parsed.data;
    codes = [code];
  }
  if (requestedMany !== undefined) {
    const parts = requestedMany.split(",");
    if (parts.length < 1 || parts.length > 9 || new Set(parts).size !== parts.length)
      throw new ApiError("bad_request");
    codes = parts.map((part) => {
      const parsed = MobileDrink.safeParse(part);
      if (!parsed.success) throw new ApiError("bad_request");
      return parsed.data;
    });
  }
  const categoryClause = codes ? " AND o.category IN (" + codes.map(() => "?").join(",") + ")" : "";
  const candidates = await c.env.DB.prepare(
    "SELECT o.venue_key, COUNT(*) AS n FROM mobile_menu_v2_offers o" +
      APPROVED +
      " WHERE o.cell=? AND o.venue_key>? AND o.status='active'" +
      categoryClause +
      " AND" +
      PUBLIC +
      " GROUP BY o.venue_key ORDER BY o.venue_key LIMIT 51",
  )
    .bind(cell, after, ...(codes ?? []))
    .all<Candidate>();
  const page = candidates.results.slice(0, 50);
  const keys = page.map((row) => row.venue_key);
  if (!keys.length)
    return c.json(
      {
        ...envelope,
        cell,
        category: code,
        categories: codes,
        venues: [],
        next_after: null,
        unresolved_venues: 0,
      },
      200,
      { "Cache-Control": "no-store" },
    );
  const marks = keys.map(() => "?").join(",");
  const registryRows = await c.env.DB.prepare(
    "SELECT venue_key,cell,name,kind,lat,lon,address,city,country,identity_kind,identity_url,identity_fingerprint,identity_text_sha256,identity_geo_url,identity_geo_text_sha256,identity_geo_hash_basis" +
      " FROM mobile_menu_v2_venues WHERE cell=? AND venue_key IN (" +
      marks +
      ")",
  )
    .bind(cell, ...keys)
    .all<Registry>();
  const registry = new Map(registryRows.results.map((row) => [row.venue_key, registryVenue(row)]));
  const ownerPlaces = [...registry.values()].filter(
    (place) => place.identity_kind === "owner_verified",
  );
  const hasOwner = ownerPlaces.length > 0;
  const legacyFile =
    keys.some((key) => !registry.has(key)) || hasOwner ? await cellFile(c.env, cell) : null;
  let duplicateFiles: Awaited<ReturnType<typeof cellFile>>[] = [];
  let userRows: Nearby[] = [];
  let peerRows: Nearby[] = [];
  if (hasOwner) {
    const cells = [...new Set(ownerPlaces.flatMap(duplicateCells))];
    const marks = cells.map(() => "?").join(",");
    const [otherFiles, users, peers] = await Promise.all([
      Promise.all(cells.filter((other) => other !== cell).map((other) => cellFile(c.env, other))),
      c.env.DB.prepare(
        "SELECT name,lat,lon FROM venues_user WHERE cell IN (" +
          marks +
          ") AND status IN ('approved','pending')",
      )
        .bind(...cells)
        .all<Nearby>(),
      c.env.DB.prepare(
        "SELECT venue_key,name,lat,lon,address FROM mobile_menu_v2_venues" +
          " WHERE cell IN (" +
          marks +
          ") AND identity_kind='owner_verified'",
      )
        .bind(...cells)
        .all<Nearby>(),
    ]);
    duplicateFiles = [legacyFile, ...otherFiles];
    userRows = users.results;
    peerRows = peers.results;
  }
  const visible = page
    .map((row) => {
      const place = registry.get(row.venue_key) ?? staticVenue(legacyFile, row.venue_key, cell);
      return {
        venue:
          place &&
          place.identity_kind === "owner_verified" &&
          nearbyDuplicate(place, duplicateFiles, userRows, peerRows)
            ? null
            : place,
        count: row.n,
      };
    })
    .filter((row): row is { venue: Venue; count: number } => row.venue !== null);
  const unresolved = page.length - visible.length;
  const visibleKeys = visible.map((row) => row.venue.key);
  if (!visibleKeys.length)
    return c.json(
      {
        ...envelope,
        cell,
        category: code,
        categories: codes,
        venues: [],
        next_after: candidates.results.length > 50 ? page.at(-1)?.venue_key : null,
        unresolved_venues: unresolved,
      },
      200,
      { "Cache-Control": "no-store" },
    );
  let samples = new Map<string, ReturnType<typeof offer>[]>();
  if (codes && visibleKeys.length) {
    const categoryMarks = codes.map(() => "?").join(",");
    const sampleMarks = visibleKeys.map(() => "?").join(",");
    const result = await c.env.DB.prepare(
      "SELECT * FROM (SELECT " +
        OFFER_COLS +
        "," +
        " ROW_NUMBER() OVER (PARTITION BY o.venue_key,o.category,o.currency,o.currency_exponent" +
        " ORDER BY CASE WHEN o.price_context='regular' THEN 0 ELSE 1 END," +
        " CASE WHEN o.category='beer_draft' AND " +
        MEDIUM_DRAFT +
        " THEN 0 WHEN o.category='beer_draft' THEN 1 ELSE 0 END," +
        " o.amount_minor,o.id) AS rank FROM mobile_menu_v2_offers o" +
        APPROVED +
        " WHERE o.cell=? AND o.category IN (" +
        categoryMarks +
        ") AND o.status='active'" +
        " AND o.venue_key IN (" +
        sampleMarks +
        ")) WHERE rank=1 ORDER BY venue_key,category,currency,currency_exponent",
    )
      .bind(cell, ...codes, ...visibleKeys)
      .all<OfferRow>();
    samples = new Map();
    for (const row of result.results) {
      const list = samples.get(row.venue_key) ?? [];
      list.push(offer(row));
      samples.set(row.venue_key, list);
    }
  }
  const stateRows = await c.env.DB.prepare(
    "SELECT c.venue_key,c.status," +
      SOURCE +
      "," +
      " (SELECT COUNT(*) FROM mobile_menu_v2_fees f" +
      " JOIN mobile_menu_v2_sources fs ON fs.id=f.source_id AND fs.venue_key=f.venue_key" +
      " AND fs.cell=f.cell AND fs.use_review_status='approved'" +
      " WHERE f.venue_key=c.venue_key AND f.cell=c.cell AND f.status='active') AS fee_count" +
      " FROM mobile_menu_v2_fee_coverage c JOIN mobile_menu_v2_sources s" +
      " ON s.id=c.source_id AND s.venue_key=c.venue_key AND s.cell=c.cell" +
      " AND s.use_review_status='approved' WHERE c.cell=? AND c.venue_key IN (" +
      visibleKeys.map(() => "?").join(",") +
      ")",
  )
    .bind(cell, ...visibleKeys)
    .all<CoverageRow>();
  const states = new Map(stateRows.results.map((row) => [row.venue_key, row]));
  return c.json(
    {
      ...envelope,
      cell,
      category: code,
      categories: codes,
      venues: visible.map((row) => ({
        ...row.venue,
        matching_offer_count: row.count,
        sample_offers: samples.get(row.venue.key) ?? [],
        fee_coverage: coverage(
          states.get(row.venue.key) ?? null,
          states.get(row.venue.key)?.fee_count ?? 0,
        ),
      })),
      next_after: candidates.results.length > 50 ? page.at(-1)?.venue_key : null,
      unresolved_venues: unresolved,
    },
    200,
    { "Cache-Control": "no-store" },
  );
});
