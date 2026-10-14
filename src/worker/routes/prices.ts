import { Hono } from "hono";
import { z } from "zod";
import { findSize } from "../../shared/catalog";
import { MAX_ITEMS, QUARANTINE_MIN_PRICES, QUARANTINE_RATIO } from "../config";
import { romeDay } from "../lib/day";
import {
  activePrices,
  claimOnce,
  confirmPrice,
  getCellPrices,
  getCurrentPrice,
  hasKey,
  type PriceKey,
  writePrice,
} from "../lib/db";
import { ApiError, apiError } from "../lib/errors";
import { readJson } from "../lib/guards";
import { hmacHex } from "../lib/hmac";
import { clientIp, consumeQuota } from "../lib/quota";
import { resolveVenue } from "../lib/venues";
import { VenueKey } from "./venues";
import type { AppEnv } from "../types";

const Cell = z.string().regex(/^[0-9b-hjkmnp-z]{5}$/);
const EDGE_TTL = "public, max-age=60";
const cellCacheKey = (url: string, cell: string) =>
  new Request(new URL(`/api/prices/${cell}`, url));

/** Drops a cell from the edge cache after an admin change, so the map shows it at once. */
export const forgetCell = (url: string, cell: string) =>
  caches.default.delete(cellCacheKey(url, cell));

export const prices = new Hono<AppEnv>();

// GET /api/prices/:cell — edge cache 60 s (SPEC 5.4; inactive on workers.dev).
prices.get("/:cell", async (c) => {
  const cell = Cell.safeParse(c.req.param("cell"));
  if (!cell.success) return apiError(c, "bad_request");

  const key = cellCacheKey(c.req.url, cell.data);
  const hit = await caches.default.match(key);
  if (hit) return new Response(hit.body, hit); // mutable copy for the header middleware

  const response = c.json(await getCellPrices(c.env.DB, cell.data), 200, {
    "Cache-Control": EDGE_TTL,
  });
  c.executionCtx.waitUntil(caches.default.put(key, response.clone()));
  return response;
});

// ---- Writes (M2) ----

const Item = z.strictObject({
  drink: z.string().max(32),
  size_ml: z.number().int().min(0).max(2000),
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
  drink: z.string().max(32),
  size_ml: z.number().int().min(0).max(2000),
  hh: z.union([z.literal(0), z.literal(1)]),
});

type Result = { status: "active" | "quarantined" | "confirmed" | "rejected"; code?: string };

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

const priceId = (k: PriceKey) => `${k.venue}|${k.drink}|${String(k.size)}|${String(k.hh)}`;

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
 * Confirms a price once per session. The author never counts, neither from a new session on the
 * same IP nor the next day (D-10, security review). dedup is purged within 48 h (ADR 0016).
 */
async function confirmOnce(
  env: Env,
  who: { sid: string; ip: string },
  k: PriceKey,
  day: string,
): Promise<number | null> {
  for (const key of await authorKeys(env, who, k, day)) if (await hasKey(env.DB, key)) return null;
  // One confirmation per price per IP and per session: a reload that brings a new session does
  // not count twice (IP first, atomic).
  const byIp = await hmacHex(env.HASH_KEY, [day, "confirm", "ip", who.ip, priceId(k)]);
  const bySid = await hmacHex(env.HASH_KEY, [day, "confirm", "sid", who.sid, priceId(k)]);
  if (!(await claimOnce(env.DB, byIp, day)) || !(await claimOnce(env.DB, bySid, day))) return null;
  return confirmPrice(env.DB, k, day);
}

// POST /api/prices — 1–80 prices for one bar (SPEC 9.2, 11).
prices.post("/", async (c) => {
  const body = await readJson(c, PriceBody);
  for (const item of body.items)
    if (!findSize(item.drink, item.size_ml)) throw new ApiError("bad_request");
  const where = await resolveVenue(c.env, body.venue, body.cell);
  const who = { sid: c.var.sid, ip: clientIp(c.req.raw) };
  await consumeQuota(c.env, "price", who.sid, who.ip, body.items.length);

  const day = romeDay();
  const results: Result[] = [];
  for (const item of body.items) {
    const size = findSize(item.drink, item.size_ml);
    if (!size || item.price_cents < size.min || item.price_cents > size.max) {
      results.push({ status: "rejected", code: "out_of_range" });
      continue;
    }
    const k: PriceKey = { venue: body.venue, drink: item.drink, size: item.size_ml, hh: item.hh };
    const existing = await getCurrentPrice(c.env.DB, k);
    if (existing?.status === "review" || existing?.status === "removed") {
      // Under moderation: only the admin can change it (SPEC 11, security review).
      results.push({ status: "rejected", code: "under_review" });
      continue;
    }
    if (existing?.price_cents === item.price_cents) {
      // Same price again: a confirmation, not a new current row (SPEC 11).
      // "already": not counted (author, or this session/IP already confirmed it).
      const counted = await confirmOnce(c.env, who, k, day);
      results.push(
        counted === null ? { status: "confirmed", code: "already" } : { status: "confirmed" },
      );
      continue;
    }
    const peers = await activePrices(c.env.DB, where.cell, item.drink, item.size_ml, item.hh);
    const m = median(peers);
    const status =
      peers.length >= QUARANTINE_MIN_PRICES && Math.abs(item.price_cents - m) > QUARANTINE_RATIO * m
        ? "quarantined"
        : "active";
    await writePrice(c.env.DB, k, {
      ...where,
      price: item.price_cents,
      day,
      status,
    });
    const [bySid, byIp] = await authorKeys(c.env, who, k, day);
    for (const key of [bySid, byIp]) if (key) await claimOnce(c.env.DB, key, day);
    results.push({ status });
  }
  return c.json({ results });
});

// POST /api/prices/confirm — "Confermo", one per session per price (SPEC 7.2, M2-11).
prices.post("/confirm", async (c) => {
  const body = await readJson(c, ConfirmBody);
  const k: PriceKey = { venue: body.venue, drink: body.drink, size: body.size_ml, hh: body.hh };
  const existing = await getCurrentPrice(c.env.DB, k);
  if (!existing || existing.status === "review" || existing.status === "removed")
    throw new ApiError("not_found");
  await consumeQuota(c.env, "confirm", c.var.sid, clientIp(c.req.raw));
  const count = await confirmOnce(c.env, { sid: c.var.sid, ip: clientIp(c.req.raw) }, k, romeDay());
  return c.json(
    count === null
      ? { status: "already", confirmations: existing.confirmations }
      : { status: "confirmed", confirmations: count },
  );
});
