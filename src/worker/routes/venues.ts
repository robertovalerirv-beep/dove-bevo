import { Hono } from "hono";
import { z } from "zod";
import { it } from "../../app/i18n/it";
import { CELL_PRECISION, encodeGeohash } from "../../shared/geohash";
import { ITALY, validVenueName } from "../../shared/venue";
import { MAX_PENDING_PER_CELL, MAX_PENDING_VENUES, REJECTION_TRACE_DAYS } from "../config";
import { romeDay } from "../lib/day";
import {
  bumpProposal,
  claimOnce,
  getVenuePrices,
  listApprovedVenues,
  proposeVenue,
} from "../lib/db";
import { forgetCellCache } from "../lib/cell-cache";
import { ApiError, apiError } from "../lib/errors";
import { readJson } from "../lib/guards";
import { hmacHex } from "../lib/hmac";
import { clientIp, consumeQuota } from "../lib/quota";
import { findDuplicate } from "../lib/venues";
import type { AppEnv } from "../types";

/**
 * OSM bar ("n123", "w456", "r789") or user bar ("u12"). Canonical only: "u007" must not alias "u7"
 * (it would be a hidden price row that still counts in the median).
 */
export const VenueKey = z.string().regex(/^[nwru][1-9]\d{0,14}$/);

export const Lat = z.number().min(ITALY.south).max(ITALY.north);
export const Lon = z.number().min(ITALY.west).max(ITALY.east);
/** Bar kinds a user can propose: bar, pub, evening venue (OSM kinds 1, 2, 4). */
export const ProposedKind = z.union([z.literal(1), z.literal(2), z.literal(4)]);
export const VenueName = z
  .string()
  .max(200)
  .refine(validVenueName)
  .transform((name) => name.normalize("NFC").trim());

const Proposal = z.strictObject({ name: VenueName, kind: ProposedKind, lat: Lat, lon: Lon });

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
const daysAgo = (day: string, n: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

export const venues = new Hono<AppEnv>();

// GET /api/venues/approved — the user bars the admin approved, for the name search (ADR 0025).
// Names and positions only, the same data the cell reads already publish; one small read per visit.
venues.get("/approved", async (c) =>
  c.json({ v: await listApprovedVenues(c.env.DB) }, 200, { "Cache-Control": "public, max-age=60" }),
);

// GET /api/venues/:key/prices — current prices and short history (D-26).
venues.get("/:key/prices", async (c) => {
  const key = VenueKey.safeParse(c.req.param("key"));
  if (!key.success) return apiError(c, "bad_request");
  return c.json(await getVenuePrices(c.env.DB, key.data));
});

// POST /api/venues — a bar the user cannot find. Pending until the admin approves it (SPEC 7.5).
// The point is the pin the user confirmed (the bar's position, never the device's).
venues.post("/", async (c) => {
  const body = await readJson(c, Proposal);
  const lat = round5(body.lat);
  const lon = round5(body.lon);
  const cell = encodeGeohash(lat, lon, CELL_PRECISION);
  const who = { sid: c.var.sid, ip: clientIp(c.req.raw) };

  const day = romeDay();
  // One marker per person (IP and session, HMAC with the day as salt) and per bar: the proposer
  // and anyone repeating the same proposal count once.
  const marks = (key: string) =>
    Promise.all([
      hmacHex(c.env.HASH_KEY, [day, "propose-ip", who.ip, key]),
      hmacHex(c.env.HASH_KEY, [day, "propose-sid", who.sid, key]),
    ]);
  const known = await findDuplicate(
    c.env,
    { name: body.name, lat, lon, cell },
    daysAgo(day, REJECTION_TRACE_DAYS),
  );
  if (known) {
    // Another independent person asking for the same pending bar only moves it up the queue.
    if (known.pending && known.key) {
      const [ipKey, sidKey] = await marks(known.key);
      if ((await claimOnce(c.env.DB, ipKey, day)) && (await claimOnce(c.env.DB, sidKey, day))) {
        await bumpProposal(c.env.DB, Number(known.key.slice(1)));
        await forgetCellCache(c.env.DB, c.req.url, cell); // the count of the pending bar moved
      }
    }
    return c.json(
      { error: { code: "conflict", message: it.errors.conflict }, key: known.key },
      409,
    );
  }
  // Only a real new proposal spends the daily quota; finding the bar already there does not.
  await consumeQuota(c.env, "venue", who.sid, who.ip);
  const id = await proposeVenue(
    c.env.DB,
    { name: body.name, kind: body.kind, lat, lon, cell, day },
    MAX_PENDING_VENUES,
    MAX_PENDING_PER_CELL,
  );
  if (id === null) throw new ApiError("busy");
  await forgetCellCache(c.env.DB, c.req.url, cell); // the pending bar shows in its cell at once
  const key = `u${String(id)}`;
  for (const mark of await marks(key)) await claimOnce(c.env.DB, mark, day); // the proposer is counted
  return c.json({ key, cell });
});
