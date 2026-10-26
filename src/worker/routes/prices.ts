import { Hono } from "hono";
import { z } from "zod";
import { findDrink } from "../../shared/catalog";
import { MAX_ITEMS, QUARANTINE_MIN_PRICES, QUARANTINE_RATIO } from "../config";
import { edgeKey, forgetCellCache } from "../lib/cell-cache";
import { romeDay } from "../lib/day";
import {
  claimStatement,
  confirmStatements,
  getCurrentPrice,
  getCellSnapshot,
  loadPriceContext,
  type PriceContext,
  type PriceKey,
  runStatements,
  bandId,
  writePriceStatements,
} from "../lib/db";
import { ApiError, apiError } from "../lib/errors";
import { readJson } from "../lib/guards";
import { hmacHex } from "../lib/hmac";
import { clientIp, consumeQuota } from "../lib/quota";
import { resolveVenue } from "../lib/venues";
import { publicCellBody } from "../lib/public-cell";
import { VenueKey } from "./venues";
import type { AppEnv } from "../types";
import { requireContributionAllowed } from "../lib/contribution-restrictions";

const Cell = z.string().regex(/^[0-9b-hjkmnp-z]{5}$/);
const EDGE_TTL = "public, max-age=60";
export const prices = new Hono<AppEnv>();

// GET /api/prices/:cell — edge cache 60 s (SPEC 5.4; inactive on workers.dev).
prices.get("/:cell", async (c) => {
  const cell = Cell.safeParse(c.req.param("cell"));
  if (!cell.success) return apiError(c, "bad_request");

  const key = edgeKey(c.req.url, cell.data);
  const hit = await caches.default.match(key);
  // Old edge entries survive a deploy. Strip pending names even on a cache hit.
  if (hit) {
    const headers = new Headers(hit.headers);
    headers.delete("Content-Length");
    headers.delete("ETag");
    return new Response(publicCellBody(await hit.text()), { status: hit.status, headers });
  }

  // One row from the cell's snapshot (ADR 0020); the text is already JSON.
  const response = c.body(await getCellSnapshot(c.env.DB, cell.data), 200, {
    "Content-Type": "application/json",
    "Cache-Control": EDGE_TTL,
  });
  c.executionCtx.waitUntil(caches.default.put(key, response.clone()));
  return response;
});

// ---- Writes (M2) ----

const Item = z.strictObject({
  drink: z.string().max(32),
  hh: z.union([z.literal(0), z.literal(1)]),
  price_cents: z.number().int().min(0).max(100_000),
});
const PriceBody = z.strictObject({
  venue: VenueKey,
  cell: Cell,
  source: z.literal("manual"),
  items: z.array(Item).min(1).max(MAX_ITEMS),
});
const ConfirmBody = z.strictObject({
  venue: VenueKey,
  drink: z
    .string()
    .max(32)
    .refine((d) => findDrink(d) !== undefined),
  hh: z.union([z.literal(0), z.literal(1)]),
});

type Result = { status: "active" | "quarantined" | "confirmed" | "rejected"; code?: string };

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

const priceId = (k: PriceKey) => `${k.venue}|${k.drink}|${String(k.hh)}`;

/** Author markers of a price, by session and by IP (HMAC, day as salt): today and yesterday. */
async function authorKeys(env: Env, who: { sid: string; ip: string }, k: PriceKey, day: string) {
  const yesterday = romeDay(new Date(Date.now() - 86_400_000));
  const keys: string[] = [];
  for (const d of new Set([day, yesterday])) {
    keys.push(await hmacHex(env.HASH_KEY, [d, "author", "sid", who.sid, priceId(k)]));
    keys.push(await hmacHex(env.HASH_KEY, [d, "author", "ip", who.ip, priceId(k)]));
  }
  return keys;
}

/**
 * The statements that confirm a price once per session (D-10, security review): the author never
 * counts, neither from a new session on the same IP nor the next day, and a person counts once per
 * price whatever the session. The count and the markers are one batch (see confirmStatements), so
 * the checks cost no round trip of their own. Scheduled cleanup removes dedup rows older than
 * yesterday in the Rome calendar (ADR 0016); this is not an exact 48-hour retention bound.
 */
async function confirmStatementsFor(
  env: Env,
  who: { sid: string; ip: string },
  k: PriceKey,
  day: string,
) {
  const authors = await authorKeys(env, who, k, day);
  const byIp = await hmacHex(env.HASH_KEY, [day, "confirm", "ip", who.ip, priceId(k)]);
  const bySid = await hmacHex(env.HASH_KEY, [day, "confirm", "sid", who.sid, priceId(k)]);
  return confirmStatements(env.DB, k, day, [...authors, byIp, bySid], [byIp, bySid]);
}

/** The new count when the confirmation counted, null when this person already had their say. */
const countedBy = (result: D1Result | undefined): number | null =>
  (result?.results[0] as { confirmations: number } | undefined)?.confirmations ?? null;

type Planned = Result | { confirmAt: number };

// POST /api/prices — 1–80 prices for one bar (SPEC 9.2, 11). One read batch for the bar's rows and
// the cell's peers, the items decided in memory in order (a repeated drink sees the one before), one
// write batch: a few D1 round trips instead of up to six per item (ADR 0025).
prices.post("/", async (c) => {
  await requireContributionAllowed(c);
  const body = await readJson(c, PriceBody);
  for (const item of body.items) if (!findDrink(item.drink)) throw new ApiError("bad_request");
  const where = await resolveVenue(c.env, body.venue, body.cell);
  const who = { sid: c.var.sid, ip: clientIp(c.req.raw) };
  await consumeQuota(c.env, "price", who.sid, who.ip, body.items.length);

  const day = romeDay();
  const inRange = (item: (typeof body.items)[number]) => {
    const drink = findDrink(item.drink);
    return !!drink && item.price_cents >= drink.min && item.price_cents <= drink.max;
  };
  const drinks = [...new Set(body.items.filter(inRange).map((item) => item.drink))];
  const { own, peers }: PriceContext =
    drinks.length > 0
      ? await loadPriceContext(c.env.DB, body.venue, where.cell, drinks)
      : { own: new Map(), peers: new Map() };

  const statements: D1PreparedStatement[] = [];
  const planned: Planned[] = [];
  for (const item of body.items) {
    if (!inRange(item)) {
      planned.push({ status: "rejected", code: "out_of_range" });
      continue;
    }
    const k: PriceKey = { venue: body.venue, drink: item.drink, hh: item.hh };
    const id = bandId(item.drink, item.hh);
    const existing = own.get(id);
    if (existing?.status === "review" || existing?.status === "removed") {
      // Under moderation: only the admin can change it (SPEC 11, security review).
      planned.push({ status: "rejected", code: "under_review" });
      continue;
    }
    if (existing?.price === item.price_cents) {
      // Same price again: a confirmation, not a new current row (SPEC 11).
      planned.push({ confirmAt: statements.length });
      statements.push(...(await confirmStatementsFor(c.env, who, k, day)));
      continue;
    }
    // Peers: the other public bars of the cell, plus this bar's own active price if it is public.
    const others = peers.get(id) ?? [];
    const ownCounts =
      existing?.status === "active" && where.isPublic && existing.cell === where.cell;
    const all = ownCounts ? [...others, existing.price] : others;
    const m = median(all);
    const status =
      all.length >= QUARANTINE_MIN_PRICES && Math.abs(item.price_cents - m) > QUARANTINE_RATIO * m
        ? "quarantined"
        : "active";
    statements.push(
      ...writePriceStatements(c.env.DB, k, { ...where, price: item.price_cents, day, status }),
    );
    const [bySid, byIp] = await authorKeys(c.env, who, k, day);
    for (const key of [bySid, byIp]) if (key) statements.push(claimStatement(c.env.DB, key, day));
    own.set(id, { price: item.price_cents, status, cell: where.cell });
    planned.push({ status });
  }

  const done = await runStatements(c.env.DB, statements);
  if (statements.length > 0) await forgetCellCache(c.env.DB, c.req.url, where.cell);
  const results = planned.map((p): Result => {
    if (!("confirmAt" in p)) return p;
    // "already": not counted (author, or this session/IP already confirmed it).
    return countedBy(done[p.confirmAt]) === null
      ? { status: "confirmed", code: "already" }
      : { status: "confirmed" };
  });
  return c.json({ results });
});

// POST /api/prices/confirm — "Confermo", one per session per price (SPEC 7.2, M2-11).
prices.post("/confirm", async (c) => {
  await requireContributionAllowed(c);
  const body = await readJson(c, ConfirmBody);
  const k: PriceKey = { venue: body.venue, drink: body.drink, hh: body.hh };
  const existing = await getCurrentPrice(c.env.DB, k);
  if (!existing || existing.status === "review" || existing.status === "removed")
    throw new ApiError("not_found");
  await consumeQuota(c.env, "confirm", c.var.sid, clientIp(c.req.raw));
  const who = { sid: c.var.sid, ip: clientIp(c.req.raw) };
  const [update] = await runStatements(
    c.env.DB,
    await confirmStatementsFor(c.env, who, k, romeDay()),
  );
  const count = countedBy(update);
  if (count !== null) await forgetCellCache(c.env.DB, c.req.url, existing.cell);
  return c.json(
    count === null
      ? { status: "already", confirmations: existing.confirmations }
      : { status: "confirmed", confirmations: count },
  );
});
