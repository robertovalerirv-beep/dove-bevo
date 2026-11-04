import { Hono } from "hono";
import { z } from "zod";
import { it } from "../../app/i18n/it";
import { findDrink } from "../../shared/catalog";
import type {
  ExactDrinkAreaRow,
  ExactDrinkAreaVotes,
  ExactDrinkTarget,
  ExactDrinkVenueVotes,
  ExactDrinkVote,
} from "../../shared/mobile-exact-drink-votes";
import { ApiError } from "../lib/errors";
import { readJson } from "../lib/guards";
import { hmacHex } from "../lib/hmac";
import { consumeRecommendationQuota } from "../lib/mobile-recommendations";
import { clientIp } from "../lib/quota";
import { publicVenueName } from "../lib/venues";
import type { AppEnv } from "../types";
import { currentStaticMenuVenue, resolveContributableMenuVenue } from "./mobile-menu-v2";
import {
  MobileCell,
  MobileCurrency,
  MobileDrink,
  Serving,
  resolveMobileVenue,
  servingFromKey,
  servingKey,
  validServing,
} from "./mobile-price-catalog";
import { SELECT_PUBLIC, publicMobilePrice, type MobilePriceDb } from "./mobile-price-store";

const Key = z.string().regex(/^(?:m[0-9a-f]{24}|[nwru][1-9][0-9]{0,14})$/);
const Voter = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const OfferId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
const CustomerId = z.string().regex(/^c[0-9a-f]{64}$/);
const Drink = z.string().refine((value) => findDrink(value) !== undefined);
const Target = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("offer"), id: OfferId }),
  z.strictObject({ kind: z.literal("customer"), id: CustomerId }),
  z.strictObject({
    kind: z.literal("legacy"),
    drink: Drink,
    band: z.enum(["normal", "happy_hour"]),
  }),
  z.strictObject({
    kind: z.literal("europe"),
    drink: MobileDrink,
    band: z.enum(["normal", "happy_hour"]),
    currency: MobileCurrency,
    serving: Serving,
  }),
]);
const Vote = z.strictObject({ target: Target, recommended: z.boolean() });
const CursorTuple = z.tuple([
  z.number().int().min(1),
  Key,
  z.enum(["offer", "customer", "legacy", "europe"]),
  z.string().min(1).max(128),
  z.string().min(5).max(78),
]);
const BASE32 = /^[0123456789bcdefghjkmnpqrstuvwxyz]{5}$/;
const MAX_CELLS = 12;
const MAX_AREA_ROWS = 50;
const MAX_VENUE_ROWS = 1000;

type StoredTarget = { kind: "offer" | "customer" | "legacy" | "europe"; id: string };
type CountRow = {
  venue_key: string;
  cell: string;
  target_kind: StoredTarget["kind"];
  target_id: string;
  count: number;
  currency: string | null;
};
type PublicVenue = {
  key: string;
  cell: string;
  name: string;
  city: string | null;
  currency: "EUR" | "GBP" | null;
};
type DrinkDetail = { name: string; category: string | null; serving_label: string | null };
type Cursor = {
  count: number;
  venue: string;
  kind: StoredTarget["kind"];
  id: string;
  scope: string;
};

/** The customer row for an owner offer uses the offer ID, so both displays share one count. */
function storedTarget(value: ExactDrinkTarget): StoredTarget {
  if (value.kind === "legacy") return { kind: "legacy", id: `${value.drink}:${value.band}` };
  if (value.kind === "europe") {
    if (!validServing(value.drink, value.serving)) throw new ApiError("bad_request");
    return {
      kind: "europe",
      id: `${value.drink}:${value.band}:${value.currency}:${servingKey(value.serving)}`,
    };
  }
  return { kind: value.kind, id: value.id };
}

function publicTarget(kind: StoredTarget["kind"], id: string): ExactDrinkTarget {
  if (kind === "europe") {
    const [drink, band, currency, unit, ml, extra] = id.split(":");
    if (extra !== undefined || !drink || !band || !currency || !unit || ml === undefined)
      throw new ApiError("internal");
    const serving = Serving.safeParse({ unit, ...(ml ? { ml: Number(ml) } : {}) });
    if (!serving.success) throw new ApiError("internal");
    const parsed = Target.safeParse({ kind, drink, band, currency, serving: serving.data });
    if (!parsed.success || !validServing(drink, serving.data)) throw new ApiError("internal");
    if (storedTarget(parsed.data).id !== id) throw new ApiError("internal");
    return parsed.data;
  }
  if (kind === "legacy") {
    const [drink, band, extra] = id.split(":");
    if (extra !== undefined || !drink || !band) throw new ApiError("internal");
    const parsed = Target.safeParse({ kind, drink, band });
    if (!parsed.success) throw new ApiError("internal");
    return parsed.data;
  }
  const parsed = Target.safeParse({ kind, id });
  if (!parsed.success) throw new ApiError("internal");
  return parsed.data;
}

function safeCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new ApiError("internal");
  return value;
}

/** European rows are opt-in so older beta clients keep their original result set. */
function queryCell(url: string, allowEurope: boolean): { cell: string; includeEurope: boolean } {
  const query = new URL(url).searchParams;
  const values = query.getAll("cell");
  const include = query.getAll("include_europe");
  const cell = MobileCell.safeParse(values.length === 1 ? values[0] : undefined);
  if (
    !cell.success ||
    include.length > 1 ||
    (include.length === 1 && (!allowEurope || include[0] !== "1")) ||
    [...query.keys()].some((key) => key !== "cell" && key !== "include_europe")
  )
    throw new ApiError("bad_request");
  return { cell: cell.data, includeEurope: include.length === 1 };
}

function cursorScope(cells: string[], includeEurope: boolean): string {
  return cells.join(",") + (includeEurope ? "|europe" : "");
}
function queryArea(url: string): {
  cells: string[];
  limit: number;
  after: Cursor | null;
  includeEurope: boolean;
} {
  const query = new URL(url).searchParams;
  const rawCells = query.getAll("cells");
  const rawLimit = query.getAll("limit");
  const rawAfter = query.getAll("after");
  const rawInclude = query.getAll("include_europe");
  if (
    rawCells.length !== 1 ||
    rawLimit.length > 1 ||
    rawAfter.length > 1 ||
    rawInclude.length > 1 ||
    (rawInclude.length === 1 && rawInclude[0] !== "1") ||
    [...query.keys()].some((key) => !["cells", "limit", "after", "include_europe"].includes(key))
  )
    throw new ApiError("bad_request");
  const split = rawCells[0]?.split(",") ?? [];
  if (split.length < 1 || split.length > MAX_CELLS || split.some((cell) => !BASE32.test(cell)))
    throw new ApiError("bad_request");
  const cells = [...new Set(split)].sort();
  const limit = rawLimit.length === 0 ? MAX_AREA_ROWS : Number(rawLimit[0]);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_AREA_ROWS ||
    (String(limit) !== rawLimit[0] && rawLimit.length > 0)
  )
    throw new ApiError("bad_request");
  const includeEurope = rawInclude.length === 1;
  return {
    cells,
    limit,
    includeEurope,
    after: rawAfter.length
      ? parseCursor(rawAfter[0] ?? "", cursorScope(cells, includeEurope))
      : null,
  };
}

function parseCursor(raw: string, expectedScope: string): Cursor {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(raw)) throw new ApiError("bad_request");
  let value: unknown;
  try {
    value = JSON.parse(atob(raw.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    throw new ApiError("bad_request");
  }
  const parsed = CursorTuple.safeParse(value);
  if (!parsed.success) throw new ApiError("bad_request");
  const [count, venue, kind, id, scope] = parsed.data;
  if (scope !== expectedScope) throw new ApiError("bad_request");
  if (kind === "europe" && !expectedScope.endsWith("|europe")) throw new ApiError("bad_request");
  try {
    publicTarget(kind, id);
  } catch {
    throw new ApiError("bad_request");
  }
  const cursor: Cursor = { count, venue, kind, id, scope };
  if (encodeCursor(cursor) !== raw) throw new ApiError("bad_request");
  return cursor;
}

function encodeCursor(value: Cursor): string {
  return btoa(JSON.stringify([value.count, value.venue, value.kind, value.id, value.scope]))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function voterHeader(header: string | undefined, required: boolean): string | null {
  if (header === undefined && !required) return null;
  const parsed = Voter.safeParse(header);
  if (!parsed.success) throw new ApiError("bad_request");
  return parsed.data;
}

async function publicVenue(env: Env, key: string, cell: string): Promise<PublicVenue> {
  const blocked = await env.DB.prepare(
    "SELECT 1 AS blocked WHERE EXISTS (SELECT 1 FROM venues_hidden WHERE venue_key=?1)" +
      " OR EXISTS (SELECT 1 FROM mobile_venues_moderation WHERE venue_key=?1)",
  )
    .bind(key)
    .first<{ blocked: number }>();
  if (blocked) throw new ApiError("not_found");
  const legacyName = await publicVenueName(env, key, cell);
  if (legacyName !== null) {
    const original = key.startsWith("u") ? null : await currentStaticMenuVenue(env, key, cell);
    return { key, cell, name: legacyName, city: original?.city ?? null, currency: null };
  }
  try {
    const venue = await resolveContributableMenuVenue(env, key, cell);
    return { key, cell, name: venue.name, city: venue.city, currency: null };
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "not_found") throw error;
  }
  // The separately curated European catalogue is apps-only and excludes legacy
  // Italian venues. Resolve its identity from the trusted deployed asset.
  try {
    const { venue } = await resolveMobileVenue(env, key, cell);
    return { key, cell, name: venue.name, city: venue.city, currency: venue.currency };
  } catch (error) {
    if (error instanceof ApiError && error.code === "conflict") throw new ApiError("not_found");
    throw error;
  }
}

async function drinkDetail(
  env: Env,
  key: string,
  cell: string,
  target: StoredTarget,
): Promise<DrinkDetail | null> {
  if (target.kind === "offer") {
    return env.DB.prepare(
      "SELECT o.name,o.category,o.serving_label FROM mobile_menu_v2_offers o" +
        " JOIN mobile_menu_v2_sources s ON s.id=o.source_id AND s.venue_key=o.venue_key" +
        " AND s.cell=o.cell AND s.use_review_status='approved'" +
        " WHERE o.venue_key=?1 AND o.cell=?2 AND o.id=?3 AND o.status='active'",
    )
      .bind(key, cell, target.id)
      .first<DrinkDetail>();
  }
  if (target.kind === "customer") {
    return env.DB.prepare(
      "SELECT e.name,e.category,e.serving_label FROM mobile_menu_v2_customer_entries e" +
        " WHERE e.venue_key=?1 AND e.cell=?2 AND e.item_key=?3" +
        " AND e.item_kind='new_drink' AND e.status='active'" +
        " AND e.seq=(SELECT MAX(l.seq) FROM mobile_menu_v2_customer_entries l" +
        " WHERE l.venue_key=e.venue_key AND l.cell=e.cell AND l.item_key=e.item_key" +
        " AND l.status IN ('active','review','removed'))",
    )
      .bind(key, cell, target.id)
      .first<DrinkDetail>();
  }
  if (target.kind === "europe") {
    const parsed = publicTarget(target.kind, target.id);
    if (parsed.kind !== "europe") throw new ApiError("internal");
    const { venue } = await resolveMobileVenue(env, key, cell);
    if (venue.currency !== parsed.currency) return null;
    const row = await env.DB.prepare(
      SELECT_PUBLIC +
        " WHERE p.venue_key=?1 AND p.cell=?2 AND p.drink=?3 AND p.hh=?4" +
        " AND p.currency=?5 AND p.serving_key=?6 AND p.status IN ('active','quarantined')" +
        " AND NOT EXISTS (SELECT 1 FROM prices_current WHERE venue_key=?1)" +
        " AND NOT EXISTS (SELECT 1 FROM price_obs WHERE venue_key=?1)",
    )
      .bind(
        key,
        cell,
        parsed.drink,
        parsed.band === "happy_hour" ? 1 : 0,
        parsed.currency,
        servingKey(parsed.serving),
      )
      .first<MobilePriceDb>();
    if (!row) return null;
    const price = publicMobilePrice(row);
    const serving = servingFromKey(row.serving_key);
    const label =
      serving.unit === "ml"
        ? `${String(serving.ml)} ml`
        : serving.unit === "glass"
          ? `Calice${serving.ml ? ` · ${String(serving.ml)} ml` : ""}`
          : "Drink singolo";
    return {
      name: it.drinks[price.drink] ?? price.drink,
      category: price.drink,
      serving_label: price.hh === 1 ? `Happy hour · ${label}` : label,
    };
  }
  const [drink, band] = target.id.split(":");
  if (!drink || !band || !findDrink(drink) || !["normal", "happy_hour"].includes(band)) return null;
  const price = await env.DB.prepare(
    "SELECT 1 AS present FROM prices_current WHERE venue_key=?1 AND cell=?2" +
      " AND drink=?3 AND hh=?4 AND status IN ('active','quarantined')",
  )
    .bind(key, cell, drink, band === "happy_hour" ? 1 : 0)
    .first<{ present: number }>();
  return price
    ? {
        name: it.drinks[drink] ?? drink,
        category: drink,
        serving_label: band === "happy_hour" ? "Happy hour" : null,
      }
    : null;
}

async function claim(
  env: Env,
  voter: string,
  key: string,
  cell: string,
  target: StoredTarget,
): Promise<string> {
  return hmacHex(env.HASH_KEY, [
    "mobile-exact-drink-vote-v1",
    voter,
    key,
    cell,
    target.kind,
    target.id,
  ]);
}

function voteRow(row: CountRow, own: Set<string>): ExactDrinkVote {
  const target = publicTarget(row.target_kind, row.target_id);
  return {
    target,
    count: safeCount(row.count),
    recommended: own.has(`${row.target_kind}\u0000${row.target_id}`),
  };
}

/** Only currently public exact targets count, even if old claims remain for audit. */
const VALID_TARGET = `(
 (t.target_kind='offer' AND EXISTS (
   SELECT 1 FROM mobile_menu_v2_offers o JOIN mobile_menu_v2_sources s
     ON s.id=o.source_id AND s.venue_key=o.venue_key AND s.cell=o.cell
       AND s.use_review_status='approved'
   WHERE o.venue_key=t.venue_key AND o.cell=t.cell AND o.id=t.target_id AND o.status='active'))
 OR (t.target_kind='customer' AND EXISTS (
   SELECT 1 FROM mobile_menu_v2_customer_entries e
   WHERE e.venue_key=t.venue_key AND e.cell=t.cell AND e.item_key=t.target_id
     AND e.item_kind='new_drink' AND e.status='active'
     AND e.seq=(SELECT MAX(l.seq) FROM mobile_menu_v2_customer_entries l
       WHERE l.venue_key=e.venue_key AND l.cell=e.cell AND l.item_key=e.item_key
         AND l.status IN ('active','review','removed'))))
 OR (t.target_kind='legacy' AND EXISTS (
   SELECT 1 FROM prices_current p WHERE p.venue_key=t.venue_key AND p.cell=t.cell
     AND p.drink || ':' || CASE WHEN p.hh=1 THEN 'happy_hour' ELSE 'normal' END=t.target_id
     AND p.status IN ('active','quarantined')))
  OR (t.target_kind='europe' AND EXISTS (
    SELECT 1 FROM mobile_prices_current p WHERE p.venue_key=t.venue_key AND p.cell=t.cell
      AND p.drink=t.drink AND p.hh=t.hh AND p.currency=t.currency
      AND p.serving_key=t.serving_key AND p.status IN ('active','quarantined')
      AND NOT EXISTS (SELECT 1 FROM prices_current WHERE venue_key=t.venue_key)
      AND NOT EXISTS (SELECT 1 FROM price_obs WHERE venue_key=t.venue_key)))
)`;

const EUROPE_ID =
  "e.drink || ':' || CASE WHEN e.hh=1 THEN 'happy_hour' ELSE 'normal' END" +
  " || ':' || e.currency || ':' || e.serving_key";
const TOTALS = (includeEurope: boolean) =>
  "WITH votes AS (SELECT venue_key,cell,target_kind,target_id,claim," +
  " NULL AS drink,NULL AS hh,NULL AS currency,NULL AS serving_key" +
  " FROM mobile_exact_drink_votes" +
  (includeEurope
    ? " UNION ALL SELECT e.venue_key,e.cell,'europe' AS target_kind," +
      EUROPE_ID +
      ",e.claim,e.drink,e.hh,e.currency,e.serving_key FROM mobile_europe_drink_votes e"
    : "") +
  "), totals AS (SELECT venue_key,cell,target_kind,target_id,drink,hh,currency,serving_key," +
  " COUNT(*) AS count FROM votes";
const TOTALS_GROUP =
  " GROUP BY venue_key,cell,target_kind,target_id,drink,hh,currency,serving_key)";

export const mobileExactDrinkVotes = new Hono<AppEnv>();
mobileExactDrinkVotes.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

mobileExactDrinkVotes.get("/venues/:key", async (c) => {
  const key = Key.safeParse(c.req.param("key"));
  if (!key.success) throw new ApiError("bad_request");
  const { cell, includeEurope } = queryCell(c.req.url, true);
  const voter = voterHeader(c.req.header("X-DoveBevo-Voter"), false);
  const venue = await publicVenue(c.env, key.data, cell);
  const result = await c.env.DB.prepare(
    TOTALS(includeEurope) +
      " WHERE venue_key=?1 AND cell=?2" +
      TOTALS_GROUP +
      " SELECT t.* FROM totals t WHERE " +
      VALID_TARGET +
      " ORDER BY t.target_kind,t.target_id LIMIT ?3",
  )
    .bind(key.data, cell, MAX_VENUE_ROWS + 1)
    .all<CountRow>();
  if (result.results.length > MAX_VENUE_ROWS) throw new ApiError("busy");
  const visible = result.results.filter(
    (row) => row.target_kind !== "europe" || row.currency === venue.currency,
  );
  const own = new Set<string>();
  if (voter && visible.length) {
    const claims = await Promise.all(
      visible.map((row) =>
        claim(c.env, voter, key.data, cell, { kind: row.target_kind, id: row.target_id }),
      ),
    );
    for (let offset = 0; offset < claims.length; offset += 100) {
      const chunk = claims.slice(offset, offset + 100);
      const marks = chunk.map((_, index) => `?${String(index + 3)}`).join(",");
      const selected = await c.env.DB.prepare(
        "SELECT target_kind,target_id FROM mobile_exact_drink_votes WHERE venue_key=?1" +
          " AND cell=?2 AND claim IN (" +
          marks +
          ")" +
          (includeEurope
            ? " UNION ALL SELECT 'europe' AS target_kind," +
              EUROPE_ID +
              " AS target_id FROM mobile_europe_drink_votes e" +
              " WHERE e.venue_key=?1 AND e.cell=?2 AND e.claim IN (" +
              marks +
              ")"
            : ""),
      )
        .bind(key.data, cell, ...chunk)
        .all<{ target_kind: string; target_id: string }>();
      for (const row of selected.results) own.add(`${row.target_kind}\u0000${row.target_id}`);
    }
  }
  const body: ExactDrinkVenueVotes = {
    schema_version: 1,
    venue: { key: venue.key, cell: venue.cell, name: venue.name },
    items: visible.map((row) => voteRow(row, own)),
  };
  return c.json(body);
});

mobileExactDrinkVotes.post("/venues/:key", async (c) => {
  const key = Key.safeParse(c.req.param("key"));
  if (!key.success) throw new ApiError("bad_request");
  const { cell } = queryCell(c.req.url, false);
  const voter = voterHeader(c.req.header("X-DoveBevo-Voter"), true);
  if (voter === null) throw new ApiError("bad_request");
  const body = await readJson(c, Vote);
  await publicVenue(c.env, key.data, cell);
  const target = storedTarget(body.target);
  if (!(await drinkDetail(c.env, key.data, cell, target))) throw new ApiError("not_found");
  if (body.recommended) await consumeRecommendationQuota(c.env, voter, clientIp(c.req.raw));
  const voterClaim = await claim(c.env, voter, key.data, cell, target);
  let mutation: D1PreparedStatement;
  let countStatement: D1PreparedStatement;
  let ownStatement: D1PreparedStatement;
  if (body.target.kind === "europe") {
    const values = [
      key.data,
      cell,
      body.target.drink,
      body.target.band === "happy_hour" ? 1 : 0,
      body.target.currency,
      servingKey(body.target.serving),
    ] as const;
    mutation = c.env.DB.prepare(
      body.recommended
        ? "INSERT OR IGNORE INTO mobile_europe_drink_votes" +
            " (venue_key,cell,drink,hh,currency,serving_key,claim)" +
            " SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE EXISTS" +
            " (SELECT 1 FROM mobile_prices_current p WHERE p.venue_key=?1 AND p.cell=?2" +
            " AND p.drink=?3 AND p.hh=?4 AND p.currency=?5 AND p.serving_key=?6" +
            " AND p.status IN ('active','quarantined'))" +
            " AND NOT EXISTS (SELECT 1 FROM venues_hidden WHERE venue_key=?1)" +
            " AND NOT EXISTS (SELECT 1 FROM mobile_venues_moderation WHERE venue_key=?1)" +
            " AND NOT EXISTS (SELECT 1 FROM prices_current WHERE venue_key=?1)" +
            " AND NOT EXISTS (SELECT 1 FROM price_obs WHERE venue_key=?1)"
        : "DELETE FROM mobile_europe_drink_votes WHERE venue_key=?1 AND cell=?2" +
            " AND drink=?3 AND hh=?4 AND currency=?5 AND serving_key=?6 AND claim=?7",
    ).bind(...values, voterClaim);
    countStatement = c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM mobile_europe_drink_votes WHERE venue_key=?1" +
        " AND cell=?2 AND drink=?3 AND hh=?4 AND currency=?5 AND serving_key=?6",
    ).bind(...values);
    ownStatement = c.env.DB.prepare(
      "SELECT 1 AS present FROM mobile_europe_drink_votes WHERE venue_key=?1" +
        " AND cell=?2 AND drink=?3 AND hh=?4 AND currency=?5 AND serving_key=?6 AND claim=?7",
    ).bind(...values, voterClaim);
  } else {
    mutation = c.env.DB.prepare(
      body.recommended
        ? "INSERT OR IGNORE INTO mobile_exact_drink_votes (venue_key,cell,target_kind,target_id,claim)" +
            " VALUES (?1,?2,?3,?4,?5)"
        : "DELETE FROM mobile_exact_drink_votes WHERE venue_key=?1 AND cell=?2" +
            " AND target_kind=?3 AND target_id=?4 AND claim=?5",
    ).bind(key.data, cell, target.kind, target.id, voterClaim);
    countStatement = c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM mobile_exact_drink_votes" +
        " WHERE venue_key=?1 AND cell=?2 AND target_kind=?3 AND target_id=?4",
    ).bind(key.data, cell, target.kind, target.id);
    ownStatement = c.env.DB.prepare(
      "SELECT 1 AS present FROM mobile_exact_drink_votes" +
        " WHERE venue_key=?1 AND cell=?2 AND target_kind=?3 AND target_id=?4 AND claim=?5",
    ).bind(key.data, cell, target.kind, target.id, voterClaim);
  }
  const [, count, own] = await c.env.DB.batch<{ count?: number; present?: number }>([
    mutation,
    countStatement,
    ownStatement,
  ]);
  const result: ExactDrinkVote = {
    target: body.target,
    count: safeCount(count?.results[0]?.count ?? -1),
    recommended: own?.results.length === 1,
  };
  return c.json(result);
});

mobileExactDrinkVotes.get("/area", async (c) => {
  const { cells, limit, after, includeEurope } = queryArea(c.req.url);
  const marks = cells.map(() => "?").join(",");
  const filter = after
    ? ` AND (t.count<? OR (t.count=? AND t.venue_key>?)
    OR (t.count=? AND t.venue_key=? AND t.target_kind>?)
    OR (t.count=? AND t.venue_key=? AND t.target_kind=? AND t.target_id>?))`
    : "";
  const cursorArgs = after
    ? [
        after.count,
        after.count,
        after.venue,
        after.count,
        after.venue,
        after.kind,
        after.count,
        after.venue,
        after.kind,
        after.id,
      ]
    : [];
  const result = await c.env.DB.prepare(
    TOTALS(includeEurope) +
      ` WHERE cell IN (${marks})` +
      TOTALS_GROUP +
      " SELECT t.* FROM totals t WHERE " +
      VALID_TARGET +
      " AND NOT EXISTS (SELECT 1 FROM venues_hidden h WHERE h.venue_key=t.venue_key)" +
      " AND NOT EXISTS (SELECT 1 FROM mobile_venues_moderation m WHERE m.venue_key=t.venue_key)" +
      filter +
      " ORDER BY t.count DESC,t.venue_key,t.target_kind,t.target_id LIMIT ?",
  )
    .bind(...cells, ...cursorArgs, limit + 1)
    .all<CountRow>();
  const venueCache = new Map<string, Promise<PublicVenue>>();
  const rows: ExactDrinkAreaRow[] = [];
  const page = result.results.slice(0, limit);
  for (const row of page) {
    const target: StoredTarget = { kind: row.target_kind, id: row.target_id };
    try {
      const venueId = `${row.venue_key}\u0000${row.cell}`;
      let venue = venueCache.get(venueId);
      if (!venue) {
        venue = publicVenue(c.env, row.venue_key, row.cell);
        venueCache.set(venueId, venue);
      }
      const [place, drink] = await Promise.all([
        venue,
        drinkDetail(c.env, row.venue_key, row.cell, target),
      ]);
      if (drink)
        rows.push({
          venue: { key: place.key, cell: place.cell, name: place.name, city: place.city },
          target: publicTarget(target.kind, target.id),
          drink,
          count: safeCount(row.count),
        });
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== "not_found") throw error;
    }
  }
  const last = page.at(-1);
  const body: ExactDrinkAreaVotes = {
    schema_version: 1,
    scope: { cells },
    items: rows,
    next_after:
      result.results.length > limit && last
        ? encodeCursor({
            count: safeCount(last.count),
            venue: last.venue_key,
            kind: last.target_kind,
            id: last.target_id,
            scope: cursorScope(cells, includeEurope),
          })
        : null,
  };
  return c.json(body);
});
