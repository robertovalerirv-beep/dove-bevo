// POST /api/reports — closed reasons only, one per session per price or bar (SPEC 7.2, 11, D-07).
import { Hono } from "hono";
import { z } from "zod";
import { REVIEW_AFTER_REPORTS } from "../config";
import { romeDay } from "../lib/day";
import { addReport, claimOnce, getCurrentPrice, sendToReview, type PriceKey } from "../lib/db";
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
  drink: z.string().max(32).optional(),
  size_ml: z.number().int().min(0).max(2000).optional(),
  hh: z.union([z.literal(0), z.literal(1)]).optional(),
});

export const reports = new Hono<AppEnv>();

reports.post("/", async (c) => {
  const body = await readJson(c, Body);
  const onPrice = body.drink !== undefined && body.size_ml !== undefined && body.hh !== undefined;
  if (body.reason === "wrong_price" && !onPrice) throw new ApiError("bad_request");
  const k: PriceKey | null = onPrice
    ? { venue: body.venue, drink: body.drink ?? "", size: body.size_ml ?? 0, hh: body.hh ?? 0 }
    : null;
  if (k) {
    const current = await getCurrentPrice(c.env.DB, k);
    if (!current || current.status === "review" || current.status === "removed")
      throw new ApiError("not_found");
  } else {
    await resolveVenue(c.env, body.venue, body.cell); // the bar must exist
  }
  await consumeQuota(c.env, "report", c.var.sid, clientIp(c.req.raw));
  const day = romeDay();
  const target = k ? `${k.venue}|${k.drink}|${String(k.size)}|${String(k.hh)}` : body.venue;
  if (
    !(await claimOnce(
      c.env.DB,
      await hmacHex(c.env.HASH_KEY, [day, "report", c.var.sid, target]),
      day,
    ))
  ) {
    return c.json({ status: "already" });
  }
  const total = await addReport(
    c.env.DB,
    { venue: body.venue, drink: k?.drink ?? null, size: k?.size ?? null, hh: k?.hh ?? null },
    body.reason,
    day,
  );
  if (k && total > REVIEW_AFTER_REPORTS) await sendToReview(c.env.DB, k);
  return c.json({ status: "reported" });
});
