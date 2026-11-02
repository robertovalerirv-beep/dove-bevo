import { Hono } from "hono";
import { encodeGeohash } from "../../shared/geohash";
import { OSM_KEY_PATTERN } from "../../shared/venue";
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
  if (!value || !OSM_KEY_PATTERN.test(value)) throw new ApiError("bad_request");
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
  if (
    !OSM_KEY_PATTERN.test(row.venue_key) ||
    encodeGeohash(row.lat, row.lon, 5) !== row.cell ||
    !row.identity_url.startsWith("https://www.openstreetmap.org/")
  )
    throw new ApiError("busy");
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
  };
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
  };
}
async function venue(env: Env, key: string, cell: string): Promise<Venue> {
  const registry = await env.DB.prepare(
    "SELECT venue_key,cell,name,kind,lat,lon,address,city,country,identity_url" +
      " FROM mobile_menu_v2_venues WHERE venue_key=?1 AND cell=?2",
  )
    .bind(key, cell)
    .first<Registry>();
  if (registry) return registryVenue(registry);
  const original = staticVenue(await cellFile(env, cell), key, cell);
  if (!original) throw new ApiError("not_found");
  return original;
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
  let code: string | null = null;
  if (requested !== undefined) {
    const parsed = MobileDrink.safeParse(requested);
    if (!parsed.success) throw new ApiError("bad_request");
    code = parsed.data;
  }
  const candidates = await c.env.DB.prepare(
    "SELECT o.venue_key, COUNT(*) AS n FROM mobile_menu_v2_offers o" +
      APPROVED +
      " WHERE o.cell=?1 AND o.venue_key>?2 AND o.status='active'" +
      " AND (?3 IS NULL OR o.category=?3) AND" +
      PUBLIC +
      " GROUP BY o.venue_key ORDER BY o.venue_key LIMIT 51",
  )
    .bind(cell, after, code)
    .all<Candidate>();
  const page = candidates.results.slice(0, 50);
  const keys = page.map((row) => row.venue_key);
  if (!keys.length)
    return c.json(
      {
        ...envelope,
        cell,
        category: code,
        venues: [],
        next_after: null,
        unresolved_venues: 0,
      },
      200,
      { "Cache-Control": "no-store" },
    );
  const marks = keys.map(() => "?").join(",");
  const registryRows = await c.env.DB.prepare(
    "SELECT venue_key,cell,name,kind,lat,lon,address,city,country,identity_url" +
      " FROM mobile_menu_v2_venues WHERE cell=? AND venue_key IN (" +
      marks +
      ")",
  )
    .bind(cell, ...keys)
    .all<Registry>();
  const registry = new Map(registryRows.results.map((row) => [row.venue_key, registryVenue(row)]));
  const legacyFile = keys.some((key) => !registry.has(key)) ? await cellFile(c.env, cell) : null;
  const visible = page
    .map((row) => ({
      venue: registry.get(row.venue_key) ?? staticVenue(legacyFile, row.venue_key, cell),
      count: row.n,
    }))
    .filter((row): row is { venue: Venue; count: number } => row.venue !== null);
  const unresolved = page.length - visible.length;
  const visibleKeys = visible.map((row) => row.venue.key);
  if (!visibleKeys.length)
    return c.json(
      {
        ...envelope,
        cell,
        category: code,
        venues: [],
        next_after: candidates.results.length > 50 ? page.at(-1)?.venue_key : null,
        unresolved_venues: unresolved,
      },
      200,
      { "Cache-Control": "no-store" },
    );
  let samples = new Map<string, ReturnType<typeof offer>[]>();
  if (code && visibleKeys.length) {
    const sampleMarks = visibleKeys.map(() => "?").join(",");
    const result = await c.env.DB.prepare(
      "SELECT * FROM (SELECT " +
        OFFER_COLS +
        "," +
        " ROW_NUMBER() OVER (PARTITION BY o.venue_key,o.currency,o.currency_exponent" +
        " ORDER BY CASE WHEN o.price_context='regular' THEN 0 ELSE 1 END," +
        " o.amount_minor,o.id) AS rank FROM mobile_menu_v2_offers o" +
        APPROVED +
        " WHERE o.cell=? AND o.category=? AND o.status='active'" +
        " AND o.venue_key IN (" +
        sampleMarks +
        ")) WHERE rank=1",
    )
      .bind(cell, code, ...visibleKeys)
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
