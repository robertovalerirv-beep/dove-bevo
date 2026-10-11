import { Hono } from "hono";
import { z } from "zod";
import { getVenuePrices } from "../lib/db";
import { apiError } from "../lib/errors";
import type { AppEnv } from "../types";

/** OSM bar ("n123", "w456", "r789") or user bar ("u12"). */
export const VenueKey = z.string().regex(/^[nwru]\d{1,15}$/);

export const venues = new Hono<AppEnv>();

// GET /api/venues/:key/prices — current prices and short history (D-26).
venues.get("/:key/prices", async (c) => {
  const key = VenueKey.safeParse(c.req.param("key"));
  if (!key.success) return apiError(c, "bad_request");
  return c.json(await getVenuePrices(c.env.DB, key.data));
});
