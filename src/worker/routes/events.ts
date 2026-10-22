// POST /api/events — anonymous counters only (SPEC 12, D-06). No session and no JSON content type,
// because sendBeacon sends text/plain; Origin, rate limit, a 2 KB body and a closed schema protect it.
import { Hono } from "hono";
import { z } from "zod";
import { findDrink } from "../../shared/catalog";
import { DAY_BUCKETS, EVENT_NAMES, EVENTS_BODY_LIMIT, MAX_EVENTS } from "../../shared/events";
import { romeDay } from "../lib/day";
import { addMetrics } from "../lib/db";
import { ApiError } from "../lib/errors";
import { readBody } from "../lib/guards";
import type { AppEnv } from "../types";

const Props = z.strictObject({
  day_bucket: z.enum(DAY_BUCKETS).optional(),
  source: z.literal("manual").optional(),
  drink: z
    .string()
    .max(32)
    .refine((d) => findDrink(d) !== undefined)
    .optional(),
});
const Body = z.strictObject({
  events: z
    .array(z.strictObject({ e: z.enum(EVENT_NAMES), p: Props.optional() }))
    .min(1)
    .max(MAX_EVENTS),
});

export const events = new Hono<AppEnv>();

events.post("/", async (c) => {
  const bytes = await readBody(c, EVENTS_BODY_LIMIT);
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError("bad_request");
  }
  const parsed = Body.safeParse(data);
  if (!parsed.success) throw new ApiError("bad_request");

  const counts = new Map<string, number>();
  const add = (event: string, prop: string) =>
    counts.set(`${event}\u0000${prop}`, (counts.get(`${event}\u0000${prop}`) ?? 0) + 1);
  for (const { e, p } of parsed.data.events) {
    const props = Object.entries(p ?? {});
    if (props.length === 0) add(e, "-");
    for (const [key, value] of props) add(e, `${key}:${value}`);
  }
  // Share of visits with a contribution: one per beacon that holds a price_added (SPEC 12).
  if (parsed.data.events.some((ev) => ev.e === "price_added")) add("visit_contributed", "-");

  await addMetrics(
    c.env.DB,
    romeDay(),
    [...counts].map(([k, n]) => {
      const [event = "", prop = "-"] = k.split("\u0000");
      return { event, prop, n };
    }),
  );
  return c.body(null, 204);
});
