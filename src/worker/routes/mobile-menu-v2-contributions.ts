import { Hono } from "hono";
import { z } from "zod";
import { REVIEW_AFTER_REPORTS } from "../config";
import { claimOnce } from "../lib/db";
import { romeDay } from "../lib/day";
import { ApiError } from "../lib/errors";
import { readJson } from "../lib/guards";
import { hmacHex } from "../lib/hmac";
import { clientIp, consumeQuota } from "../lib/quota";
import type { AppEnv } from "../types";
import { MobileCell } from "./mobile-price-catalog";
import { currentStaticMenuVenue, resolveContributableMenuVenue } from "./mobile-menu-v2";

const Key = z.string().regex(/^(?:m[0-9a-f]{24}|[nwr][1-9][0-9]{0,14})$/);
const OfferId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
const Money = {
  amount_minor: z.number().int().min(1).max(100_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  currency_exponent: z.number().int().min(0).max(3),
  expected_revision: z.uuid().nullable(),
};
const Category = z.enum([
  "beer_draft",
  "spritz",
  "negroni",
  "sbagliato",
  "gin_tonic",
  "gin_lemon",
  "wine_glass",
  "alcohol_free",
  "water",
]);
function safeLabel(value: string): boolean {
  if (value !== value.trim() || value.normalize("NFKC") !== value) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32 || (code >= 127 && code <= 159)) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
const NewName = z.string().min(2).max(80).refine(safeLabel);
const ServingLabel = z.string().min(1).max(80).refine(safeLabel).nullable();
const Base = { venue_key: Key, cell: MobileCell, ...Money };
const Body = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("menu_offer"), ...Base, offer_id: OfferId }),
  z.strictObject({
    kind: z.literal("new_drink"),
    ...Base,
    name: NewName,
    category: Category.nullable(),
    serving_label: ServingLabel,
    serving_ml: z.number().int().min(1).max(2000).nullable(),
  }),
]);
const Report = z.strictObject({
  venue_key: Key,
  cell: MobileCell,
  entry_id: z.uuid(),
  reason: z.enum(["wrong_price", "spam"]),
});
const Decision = z.strictObject({ decision: z.enum(["approve", "remove"]) });

type Entry = {
  id: string;
  seq: number;
  venue_key: string;
  cell: string;
  item_key: string;
  item_kind: "menu_offer" | "new_drink";
  offer_id: string | null;
  name: string;
  category: string | null;
  serving_label: string | null;
  serving_ml: number | null;
  amount_minor: number;
  currency: string;
  currency_exponent: number;
  observed_on: string;
  status: "active" | "pending" | "review" | "removed";
};
type Offer = {
  id: string;
  name: string;
  category: string | null;
  serving_label: string | null;
  serving_ml: number | null;
  currency: string;
  currency_exponent: number;
};
type Item = {
  key: string;
  kind: "menu_offer" | "new_drink";
  offer: Offer | null;
  name: string;
  category: string | null;
  serving_label: string | null;
  serving_ml: number | null;
};
const LATEST =
  "SELECT id,amount_minor,status FROM mobile_menu_v2_customer_entries" +
  " WHERE venue_key=?1 AND cell=?2 AND item_key=?3" +
  " AND status IN ('active','review','removed') ORDER BY seq DESC LIMIT 1";
const UNBLOCKED =
  "NOT EXISTS (SELECT 1 FROM venues_hidden h WHERE h.venue_key=?1)" +
  " AND NOT EXISTS (SELECT 1 FROM mobile_venues_moderation m WHERE m.venue_key=?1)";
const APPROVED_ACTIVE_VENUE =
  "EXISTS (SELECT 1 FROM mobile_menu_v2_offers o" +
  " JOIN mobile_menu_v2_sources s ON s.id=o.source_id" +
  " AND s.venue_key=o.venue_key AND s.cell=o.cell AND s.use_review_status='approved'" +
  " WHERE o.venue_key=?1 AND o.cell=?2 AND o.status='active')";
const APPROVED_OFFER =
  "EXISTS (SELECT 1 FROM mobile_menu_v2_offers o" +
  " JOIN mobile_menu_v2_sources s ON s.id=o.source_id" +
  " AND s.venue_key=o.venue_key AND s.cell=o.cell AND s.use_review_status='approved'" +
  " WHERE o.id=?12 AND o.venue_key=?1 AND o.cell=?2 AND o.status='active')";

function queryCell(url: string): string {
  const values = new URL(url).searchParams.getAll("cell");
  const parsed = MobileCell.safeParse(values.length === 1 ? values[0] : undefined);
  if (!parsed.success) throw new ApiError("bad_request");
  return parsed.data;
}
function queryLimit(url: string): number {
  const values = new URL(url).searchParams.getAll("limit");
  if (!values.length) return 50;
  if (values.length !== 1 || !/^[1-9][0-9]?$/.test(values[0] ?? ""))
    throw new ApiError("bad_request");
  const number = Number(values[0]);
  if (number > 50) throw new ApiError("bad_request");
  return number;
}
function queryAfter(url: string): string {
  const values = new URL(url).searchParams.getAll("after");
  if (!values.length) return "";
  const value = values[0] ?? "";
  if (values.length !== 1 || !/^[oc][0-9a-f]{64}$/.test(value)) throw new ApiError("bad_request");
  return value;
}
function publicEntry(row: Entry) {
  return {
    revision: row.id,
    item_key: row.item_key,
    kind: row.item_kind,
    offer_id: row.offer_id,
    name: row.name,
    category: row.category,
    serving: { label: row.serving_label, ml: row.serving_ml },
    amount_minor: row.amount_minor,
    currency: row.currency,
    currency_exponent: row.currency_exponent,
    observed_on: row.observed_on,
    source_kind: "customer" as const,
    observation_kind: "customer_reported_price" as const,
    price_scope: "drink_item" as const,
  };
}
async function itemHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function countryCurrency(country: string) {
  if (country === "GB") return "GBP";
  if (
    [
      "IT",
      "FR",
      "ES",
      "DE",
      "AT",
      "BE",
      "PT",
      "NL",
      "IE",
      "FI",
      "GR",
      "SK",
      "SI",
      "EE",
      "LV",
      "LT",
      "MT",
      "CY",
      "LU",
      "HR",
    ].includes(country)
  )
    return "EUR";
  return null;
}
async function resolveItem(env: Env, body: z.infer<typeof Body>, country: string): Promise<Item> {
  const requiredCurrency = countryCurrency(country);
  if (requiredCurrency && (body.currency !== requiredCurrency || body.currency_exponent !== 2))
    throw new ApiError("bad_request");
  if (body.kind === "menu_offer") {
    const offer = await env.DB.prepare(
      "SELECT o.id,o.name,o.category,o.serving_label,o.serving_ml,o.currency,o.currency_exponent" +
        " FROM mobile_menu_v2_offers o JOIN mobile_menu_v2_sources s ON s.id=o.source_id" +
        " AND s.venue_key=o.venue_key AND s.cell=o.cell AND s.use_review_status='approved'" +
        " WHERE o.id=?1 AND o.venue_key=?2 AND o.cell=?3 AND o.status='active'",
    )
      .bind(body.offer_id, body.venue_key, body.cell)
      .first<Offer>();
    if (!offer) throw new ApiError("not_found");
    if (offer.currency !== body.currency || offer.currency_exponent !== body.currency_exponent)
      throw new ApiError("bad_request");
    return {
      key: "o" + (await itemHash(offer.id)),
      kind: body.kind,
      offer,
      name: offer.name,
      category: offer.category,
      serving_label: offer.serving_label,
      serving_ml: offer.serving_ml,
    };
  }
  const currencies = await env.DB.prepare(
    "SELECT DISTINCT o.currency,o.currency_exponent FROM mobile_menu_v2_offers o" +
      " JOIN mobile_menu_v2_sources s ON s.id=o.source_id" +
      " AND s.venue_key=o.venue_key AND s.cell=o.cell AND s.use_review_status='approved'" +
      " WHERE o.venue_key=?1 AND o.cell=?2 AND o.status='active' LIMIT 2",
  )
    .bind(body.venue_key, body.cell)
    .all<{ currency: string; currency_exponent: number }>();
  if (
    (!requiredCurrency && currencies.results.length !== 1) ||
    currencies.results.some(
      (row) => row.currency !== body.currency || row.currency_exponent !== body.currency_exponent,
    )
  )
    throw new ApiError("bad_request");
  const normalized = [
    body.name.normalize("NFKC").toLocaleLowerCase("en"),
    body.category ?? "",
    body.serving_label?.toLocaleLowerCase("en") ?? "",
    String(body.serving_ml ?? ""),
  ].join("\n");
  return {
    key: "c" + (await itemHash(normalized)),
    kind: body.kind,
    offer: null,
    name: body.name,
    category: body.category,
    serving_label: body.serving_label,
    serving_ml: body.serving_ml,
  };
}

export const mobileMenuV2CustomerPrices = new Hono<AppEnv>();
export const mobileMenuV2CustomerAdmin = new Hono<AppEnv>();

mobileMenuV2CustomerPrices.get("/venues/:key", async (c) => {
  const key = Key.safeParse(c.req.param("key"));
  if (!key.success) throw new ApiError("bad_request");
  const cell = queryCell(c.req.url);
  const limit = queryLimit(c.req.url);
  const after = queryAfter(c.req.url);
  const venue = await resolveContributableMenuVenue(c.env, key.data, cell);
  const result = await c.env.DB.prepare(
    "WITH latest AS (SELECT e.*, ROW_NUMBER() OVER" +
      " (PARTITION BY e.item_key ORDER BY e.seq DESC) AS rn" +
      " FROM mobile_menu_v2_customer_entries e" +
      " WHERE e.venue_key=?1 AND e.cell=?2 AND e.status IN ('active','review','removed'))" +
      " SELECT e.* FROM latest e WHERE e.rn=1 AND e.status='active' AND e.item_key>?3" +
      " AND (e.item_kind='new_drink' OR EXISTS (SELECT 1 FROM mobile_menu_v2_offers o" +
      " JOIN mobile_menu_v2_sources s ON s.id=o.source_id" +
      " AND s.venue_key=o.venue_key AND s.cell=o.cell AND s.use_review_status='approved'" +
      " WHERE o.id=e.offer_id AND o.venue_key=e.venue_key AND o.cell=e.cell AND o.status='active'))" +
      " ORDER BY e.item_key LIMIT ?4",
  )
    .bind(key.data, cell, after, limit + 1)
    .all<Entry>();
  const rows = result.results.slice(0, limit);
  return c.json(
    {
      schema_version: 1,
      venue: { key: venue.key, cell: venue.cell, name: venue.name, country: venue.country },
      price_scope: "customer_reported_drink_item",
      rows: rows.map(publicEntry),
      next_after: result.results.length > limit ? (rows.at(-1)?.item_key ?? null) : null,
    },
    200,
    { "Cache-Control": "no-store" },
  );
});

mobileMenuV2CustomerPrices.post("/", async (c) => {
  const body = await readJson(c, Body);
  const venue = await resolveContributableMenuVenue(c.env, body.venue_key, body.cell);
  const item = await resolveItem(c.env, body, venue.country);
  const current = await c.env.DB.prepare(LATEST)
    .bind(body.venue_key, body.cell, item.key)
    .first<Pick<Entry, "id" | "amount_minor" | "status">>();
  if (current?.status === "review") throw new ApiError("conflict");
  if (
    current?.status === "removed"
      ? body.expected_revision !== null
      : (current?.id ?? null) !== body.expected_revision
  )
    throw new ApiError("conflict");
  if (current?.status === "active" && current.amount_minor === body.amount_minor)
    return c.json({ status: "unchanged", revision: current.id }, 200);
  const pending = await c.env.DB.prepare(
    "SELECT id FROM mobile_menu_v2_customer_entries WHERE venue_key=?1" +
      " AND cell=?2 AND item_key=?3 AND status='pending' LIMIT 1",
  )
    .bind(body.venue_key, body.cell, item.key)
    .first("id");
  if (pending) throw new ApiError("conflict");
  await consumeQuota(c.env, "price", c.var.sid, clientIp(c.req.raw));
  const revision = crypto.randomUUID();
  const status =
    (item.kind === "new_drink" && !current) || current?.status === "removed" ? "pending" : "active";
  const insert = await c.env.DB.prepare(
    "INSERT INTO mobile_menu_v2_customer_entries" +
      " (id,venue_key,cell,item_key,item_kind,offer_id,name,category,serving_label,serving_ml," +
      " amount_minor,currency,currency_exponent,observed_on,status,previous_revision,changed_at)" +
      " SELECT ?4,?1,?2,?3,?5,?12,?6,?7,?8,?9,?10,?13,?14,?15,?16,?17,?18" +
      " WHERE (EXISTS (SELECT 1 FROM mobile_menu_v2_venues v WHERE v.venue_key=?1 AND v.cell=?2)" +
      " OR (?20=1 AND " +
      APPROVED_ACTIVE_VENUE +
      ")) AND " +
      UNBLOCKED +
      " AND (?5='new_drink' OR " +
      APPROVED_OFFER +
      ")" +
      " AND NOT EXISTS (SELECT 1 FROM mobile_menu_v2_customer_entries p" +
      " WHERE p.venue_key=?1 AND p.cell=?2 AND p.item_key=?3 AND p.status='pending')" +
      " AND ((?19 IS NULL AND (NOT EXISTS (SELECT 1 FROM mobile_menu_v2_customer_entries e" +
      " WHERE e.venue_key=?1 AND e.cell=?2 AND e.item_key=?3" +
      " AND e.status IN ('active','review','removed'))" +
      " OR (SELECT e.status FROM mobile_menu_v2_customer_entries e" +
      " WHERE e.venue_key=?1 AND e.cell=?2 AND e.item_key=?3" +
      " AND e.status IN ('active','review','removed')" +
      " ORDER BY e.seq DESC LIMIT 1)='removed'))" +
      " OR (?19 IS NOT NULL AND ?19=(SELECT e.id FROM mobile_menu_v2_customer_entries e" +
      " WHERE e.venue_key=?1 AND e.cell=?2 AND e.item_key=?3" +
      " AND e.status IN ('active','review','removed') ORDER BY e.seq DESC LIMIT 1)" +
      " AND EXISTS (SELECT 1 FROM mobile_menu_v2_customer_entries e" +
      " WHERE e.id=?19 AND e.status='active')))",
  )
    .bind(
      body.venue_key,
      body.cell,
      item.key,
      revision,
      item.kind,
      item.name,
      item.category,
      item.serving_label,
      item.serving_ml,
      body.amount_minor,
      // ?11 unused by design: D1 positional bind indexes must be contiguous.
      null,
      item.offer?.id ?? null,
      body.currency,
      body.currency_exponent,
      romeDay(),
      status,
      current?.id ?? null,
      new Date().toISOString(),
      body.expected_revision,
      venue.identity_kind === "osm" && venue.country === "IT" ? 1 : 0,
    )
    .run();
  if (!insert.meta.changes) throw new ApiError("conflict");
  return c.json({ status, revision, source_kind: "customer" }, status === "pending" ? 202 : 201);
});

mobileMenuV2CustomerPrices.post("/report", async (c) => {
  const body = await readJson(c, Report);
  await resolveContributableMenuVenue(c.env, body.venue_key, body.cell);
  const active = await c.env.DB.prepare(
    "SELECT id FROM mobile_menu_v2_customer_entries" +
      " WHERE id=?1 AND venue_key=?2 AND cell=?3 AND status='active'",
  )
    .bind(body.entry_id, body.venue_key, body.cell)
    .first("id");
  if (!active) throw new ApiError("not_found");
  const day = romeDay();
  const ip = clientIp(c.req.raw);
  await consumeQuota(c.env, "report", c.var.sid, ip);
  const marks = await Promise.all([
    hmacHex(c.env.HASH_KEY, [day, "mobile-menu-v2-customer-report", "ip", ip, body.entry_id]),
    hmacHex(c.env.HASH_KEY, [
      day,
      "mobile-menu-v2-customer-report",
      "sid",
      c.var.sid,
      body.entry_id,
    ]),
  ]);
  for (const mark of marks)
    if (!(await claimOnce(c.env.DB, mark, day))) return c.json({ status: "already" });
  const result = await c.env.DB.prepare(
    "INSERT INTO mobile_menu_v2_customer_reports(entry_id,reason,day)" +
      " SELECT ?1,?2,?3 WHERE EXISTS (SELECT 1 FROM mobile_menu_v2_customer_entries e" +
      " WHERE e.id=?1 AND e.status='active' AND " +
      " NOT EXISTS (SELECT 1 FROM venues_hidden h WHERE h.venue_key=e.venue_key)" +
      " AND NOT EXISTS (SELECT 1 FROM mobile_venues_moderation m WHERE m.venue_key=e.venue_key))",
  )
    .bind(body.entry_id, body.reason, day)
    .run();
  if (!result.meta.changes) throw new ApiError("conflict");
  await c.env.DB.prepare(
    "UPDATE mobile_menu_v2_customer_entries SET status='review'" +
      " WHERE id=?1 AND status='active' AND" +
      " (SELECT COUNT(*) FROM mobile_menu_v2_customer_reports WHERE entry_id=?1)>?2",
  )
    .bind(body.entry_id, REVIEW_AFTER_REPORTS)
    .run();
  return c.json({ status: "reported" });
});

mobileMenuV2CustomerAdmin.get("/pending", async (c) => {
  const values = new URL(c.req.url).searchParams.getAll("after");
  const after = values.length === 0 ? 0 : Number(values[0]);
  if (
    values.length > 1 ||
    (values.length === 1 &&
      (!/^(0|[1-9][0-9]{0,14})$/.test(values[0] ?? "") || !Number.isSafeInteger(after)))
  )
    throw new ApiError("bad_request");
  const limit = queryLimit(c.req.url);
  const result = await c.env.DB.prepare(
    "SELECT e.*,v.name AS venue_name,v.country AS venue_country" +
      " FROM mobile_menu_v2_customer_entries e" +
      " JOIN mobile_menu_v2_venues v ON v.venue_key=e.venue_key AND v.cell=e.cell" +
      " WHERE e.status IN ('pending','review') AND e.seq>?1 ORDER BY e.seq LIMIT ?2",
  )
    .bind(after, limit + 1)
    .all<Entry & { venue_name: string; venue_country: string }>();
  const rows = result.results.slice(0, limit);
  return c.json(
    {
      rows: rows.map((row) => ({
        ...publicEntry(row),
        venue: {
          key: row.venue_key,
          cell: row.cell,
          name: row.venue_name,
          country: row.venue_country,
        },
        status: row.status,
      })),
      next_after: result.results.length > limit ? (rows.at(-1)?.seq ?? null) : null,
    },
    200,
    { "Cache-Control": "no-store" },
  );
});

mobileMenuV2CustomerAdmin.post("/entries/:id/decision", async (c) => {
  const id = z.uuid().safeParse(c.req.param("id"));
  if (!id.success) throw new ApiError("bad_request");
  const body = await readJson(c, Decision);
  const nextStatus = body.decision === "approve" ? "active" : "removed";
  const result = await c.env.DB.prepare(
    "UPDATE mobile_menu_v2_customer_entries SET status=?2,moderated_at=?3" +
      " WHERE id=?1 AND status IN ('pending','review','active') AND status<>?2" +
      " AND (?2='removed' OR" +
      " (NOT EXISTS (SELECT 1 FROM venues_hidden h WHERE h.venue_key=mobile_menu_v2_customer_entries.venue_key)" +
      " AND NOT EXISTS (SELECT 1 FROM mobile_venues_moderation m WHERE m.venue_key=mobile_menu_v2_customer_entries.venue_key)" +
      " AND (item_kind='new_drink' OR EXISTS (SELECT 1 FROM mobile_menu_v2_offers o" +
      " JOIN mobile_menu_v2_sources s ON s.id=o.source_id AND s.venue_key=o.venue_key" +
      " AND s.cell=o.cell AND s.use_review_status='approved'" +
      " WHERE o.id=mobile_menu_v2_customer_entries.offer_id AND o.status='active'))))",
  )
    .bind(id.data, nextStatus, new Date().toISOString())
    .run();
  if (!result.meta.changes) throw new ApiError("conflict");
  return c.json({ status: nextStatus, revision: id.data });
});
