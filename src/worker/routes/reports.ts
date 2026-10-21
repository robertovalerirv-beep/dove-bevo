// POST /api/reports — closed reasons only, one per session per price or bar (SPEC 7.2, 11, D-07).
import { Hono } from "hono";
import { findDrink } from "../../shared/catalog";
import { z } from "zod";
import { REVIEW_AFTER_REPORTS } from "../config";
import { romeDay } from "../lib/day";
import {
  addReport,
  claimOnce,
  getCurrentPrice,
  lastPriceChange,
  sendToReview,
  type PriceKey,
} from "../lib/db";
import { ApiError } from "../lib/errors";
import { readJson } from "../lib/guards";
import { hmacHex } from "../lib/hmac";
import { clientIp, consumeQuota } from "../lib/quota";
import { resolveVenue } from "../lib/venues";
import type { AppEnv } from "../types";
import { VenueKey } from "./venues";

const Cell = z.string().regex(/^[0-9b-hjkmnp-z]{5}$/);
const Body = z.strictObject({
  venue: VenueKey,
  cell: Cell,
  reason: z.enum(["wrong_price", "closed", "not_exists", "wrong_info", "offensive"]),
  drink: z
    .string()
    .max(32)
    .refine((d) => findDrink(d) !== undefined)
    .optional(),
  hh: z.union([z.literal(0), z.literal(1)]).optional(),
});

export const reports = new Hono<AppEnv>();

reports.post("/", async (c) => {
  const body = await readJson(c, Body);
  // "Closed", "not existing" and "wrong name" are about the bar even when sent from a price row:
  // they go to the admin's bar queue and never count against the price.
  const aboutBar =
    body.reason === "closed" || body.reason === "not_exists" || body.reason === "wrong_info";
  const onPrice = !aboutBar && body.drink !== undefined && body.hh !== undefined;
  if (body.reason === "wrong_price" && !onPrice) throw new ApiError("bad_request");
  const k: PriceKey | null = onPrice
    ? { venue: body.venue, drink: body.drink ?? "", hh: body.hh ?? 0 }
    : null;
  let since: string | null = null;
  if (k) {
    const current = await getCurrentPrice(c.env.DB, k);
    if (!current || current.status === "review" || current.status === "removed")
      throw new ApiError("not_found");
    // Count from when the value last changed: confirmations refresh observed_on, not the value.
    since = (await lastPriceChange(c.env.DB, k)) ?? current.observed_on;
  } else {
    await resolveVenue(c.env, body.venue, body.cell); // the bar must exist
  }
  await consumeQuota(c.env, "report", c.var.sid, clientIp(c.req.raw));
  const day = romeDay();
  const target = k ? `${k.venue}|${k.drink}|${String(k.hh)}` : body.venue;
  // One report per target per session AND per IP (HMAC, day as salt): a single person cannot
  // reach the review threshold alone with new sessions (security review).
  const ip = clientIp(c.req.raw);
  const byIp = await hmacHex(c.env.HASH_KEY, [day, "report", "ip", ip, target]);
  const bySid = await hmacHex(c.env.HASH_KEY, [day, "report", "sid", c.var.sid, target]);
  // Claim atomically, IP first: two concurrent requests cannot both pass (security review).
  if (!(await claimOnce(c.env.DB, byIp, day)) || !(await claimOnce(c.env.DB, bySid, day))) {
    return c.json({ status: "already" });
  }
  const total = await addReport(
    c.env.DB,
    {
      venue: body.venue,
      cell: body.cell,
      drink: k?.drink ?? null,
      hh: k?.hh ?? null,
    },
    body.reason,
    day,
    since,
  );
  if (k && total > REVIEW_AFTER_REPORTS) await sendToReview(c.env.DB, k);
  return c.json({ status: "reported" });
});
