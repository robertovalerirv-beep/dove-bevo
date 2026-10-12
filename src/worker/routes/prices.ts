import { Hono } from "hono";
import { z } from "zod";
import { getCellPrices } from "../lib/db";
import { apiError } from "../lib/errors";
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
