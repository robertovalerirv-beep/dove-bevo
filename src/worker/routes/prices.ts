import { Hono } from "hono";
import { z } from "zod";
import type { CellFile } from "../../shared/api-types";
import { findSize } from "../../shared/catalog";
import { MAX_ITEMS, QUARANTINE_MIN_PRICES, QUARANTINE_RATIO } from "../config";
import { romeDay } from "../lib/day";
import {
  activePrices,
  claimOnce,
  confirmPrice,
  getCellPrices,
  getCurrentPrice,
  getUserVenue,
  hasKey,
  type PriceKey,
  writePrice,
} from "../lib/db";
import { ApiError, apiError } from "../lib/errors";
import { readJson } from "../lib/guards";
import { hmacHex } from "../lib/hmac";
import { clientIp, consumeQuota } from "../lib/quota";
import { VenueKey } from "./venues";
import type { AppEnv } from "../types";

const Cell = z.string().regex(/^[0-9b-hjkmnp-z]{5}$/);
const EDGE_TTL = "public, max-age=60";

export const prices = new Hono<AppEnv>();

// GET /api/prices/:cell — edge cache 60 s (SPEC 5.4; inactive on workers.dev).
prices.get("/:cell", async (c) => {
  const cell = Cell.safeParse(c.req.param("cell"));
  if (!cell.success) return apiError(c, "bad_request");

  const key = new Request(new URL(`/api/prices/${cell.data}`, c.req.url));
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
  source: z.enum(["manual", "menu_photo"]),
  token: z.string().max(512).optional(),
  items: z.array(Item).min(1).max(MAX_ITEMS),
});
const ConfirmBody = z.strictObject({
  venue: VenueKey,
  drink: z.string().max(32),
  size_ml: z.number().int().min(0).max(2000),
  hh: z.union([z.literal(0), z.literal(1)]),
});

type Result = { status: "active" | "quarantined" | "confirmed" | "rejected"; code?: string };

/** Cell and city of a bar, from the static file for OSM bars or D1 for user bars (SPEC 8). */
async function resolveVenue(
  env: Env,
  venue: string,
  cell: string,
): Promise<{ cell: string; city: number | null }> {
  if (venue.startsWith("u")) {
    const user = await getUserVenue(env.DB, Number(venue.slice(1)));
    if (user?.cell !== cell) throw new ApiError("bad_request");
    return { cell, city: null };
  }
  const response = await env.ASSETS.fetch(
    `https://assets.local/data/${env.DATA_VERSION}/v/${cell}.json`,
  );
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new ApiError("bad_request");
  const file: CellFile = await response.json();
  const row = file.v.find((v) => v[0] === venue);
  if (!row) throw new ApiError("bad_request");
  return { cell, city: file.c[row[6]]?.[0] ?? null };
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

const priceId = (k: PriceKey) => `${k.venue}|${k.drink}|${String(k.size)}|${String(k.hh)}`;

/** Confirms a price once per session; the author of the price never counts (D-10). */
async function confirmOnce(
  env: Env,
  sid: string,
  k: PriceKey,
  day: string,
): Promise<number | null> {
  const author = await hmacHex(env.HASH_KEY, [day, "author", sid, priceId(k)]);
  const claim = await hmacHex(env.HASH_KEY, [day, "confirm", sid, priceId(k)]);
  if ((await hasKey(env.DB, author)) || !(await claimOnce(env.DB, claim, day))) return null;
  return confirmPrice(env.DB, k, day);
}

// POST /api/prices — 1–80 prices for one bar (SPEC 9.2, 11).
prices.post("/", async (c) => {
  const body = await readJson(c, PriceBody);
  // Prices read from a photo need an extraction token (D-09): issued only by menu-extract (M3).
  if (body.source === "menu_photo") throw new ApiError("forbidden");
  for (const item of body.items)
    if (!findSize(item.drink, item.size_ml)) throw new ApiError("bad_request");
  const where = await resolveVenue(c.env, body.venue, body.cell);
  await consumeQuota(c.env, "price", c.var.sid, clientIp(c.req.raw), body.items.length);

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
    if (
      existing?.price_cents === item.price_cents &&
      existing.status !== "review" &&
      existing.status !== "removed"
    ) {
      // Same price again: a confirmation, not a new current row (SPEC 11).
      await confirmOnce(c.env, c.var.sid, k, day);
      results.push({ status: "confirmed" });
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
      source: body.source,
    });
    await claimOnce(
      c.env.DB,
      await hmacHex(c.env.HASH_KEY, [day, "author", c.var.sid, priceId(k)]),
      day,
    );
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
  const count = await confirmOnce(c.env, c.var.sid, k, romeDay());
  return c.json(
    count === null
      ? { status: "already", confirmations: existing.confirmations }
      : { status: "confirmed", confirmations: count },
  );
});
