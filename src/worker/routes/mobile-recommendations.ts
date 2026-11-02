import { Hono } from "hono";
import { z } from "zod";
import { CATALOG, findDrink } from "../../shared/catalog";
import { CELL_PATTERN } from "../../shared/venue";
import { getMobileRecommendations, isHidden, setMobileRecommendation } from "../lib/db";
import { ApiError } from "../lib/errors";
import { readJson } from "../lib/guards";
import {
  consumeRecommendationQuota,
  recommendationClaims,
  recommendationSnapshot,
} from "../lib/mobile-recommendations";
import { clientIp } from "../lib/quota";
import { publicVenueName } from "../lib/venues";
import type { AppEnv } from "../types";
import { VenueKey } from "./venues";
import { resolveMobileVenue } from "./mobile-price-catalog";

const Voter = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const Cell = z.string().regex(CELL_PATTERN);
const Choice = z.strictObject({
  drink: z
    .string()
    .max(32)
    .refine((drink) => findDrink(drink) !== undefined),
  recommended: z.boolean(),
});

/** Keep legacy/user venues independent of the app catalogue; only OSM misses fall back. */
async function recommendationVenueName(
  env: Env,
  key: string,
  cell: string,
): Promise<string | null> {
  const legacyName = await publicVenueName(env, key, cell);
  if (legacyName !== null || key.startsWith("u")) return legacyName;
  // A legacy hide is authoritative even if its stored cell differs. The fallback
  // must never resurrect it through the separately curated app catalogue.
  if (await isHidden(env.DB, key)) return null;
  const { venue } = await resolveMobileVenue(env, key, cell);
  return venue.name;
}

export const mobileRecommendations = new Hono<AppEnv>();

mobileRecommendations.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

mobileRecommendations.on(["GET", "POST"], "/:key/recommendations", async (c) => {
  const key = VenueKey.safeParse(c.req.param("key"));
  const query = new URL(c.req.url).searchParams;
  const cell = Cell.safeParse(query.get("c"));
  if (!key.success || !cell.success || query.size !== 1) throw new ApiError("bad_request");
  const header = c.req.header("X-DoveBevo-Voter");
  const parsed = Voter.safeParse(header);
  if ((header !== undefined || c.req.method === "POST") && !parsed.success) {
    throw new ApiError("bad_request");
  }
  if ((await recommendationVenueName(c.env, key.data, cell.data)) === null)
    throw new ApiError("not_found");

  const voter = parsed.success ? parsed.data : null;
  const claims = voter === null ? [] : await recommendationClaims(c.env, voter, key.data);
  if (c.req.method === "GET") {
    return c.json(
      recommendationSnapshot(key.data, await getMobileRecommendations(c.env.DB, key.data, claims)),
    );
  }
  // Already validated as required above; keeping the guard explicit also narrows the type.
  if (voter === null) throw new ApiError("bad_request");
  const choice = await readJson(c, Choice);
  if (choice.recommended) await consumeRecommendationQuota(c.env, voter, clientIp(c.req.raw));
  const claim = claims[CATALOG.findIndex(({ code }) => code === choice.drink)];
  if (claim === undefined) throw new ApiError("internal");
  const rows = await setMobileRecommendation(
    c.env.DB,
    key.data,
    choice.drink,
    claim,
    choice.recommended,
    claims,
  );
  return c.json(recommendationSnapshot(key.data, rows));
});
