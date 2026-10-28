import { CATALOG } from "../../shared/catalog";
import type { MobileRecommendations } from "../../shared/mobile-recommendations";
import { MOBILE_RECOMMENDATION_QUOTAS } from "../config";
import { addToCounter, type MobileRecommendationRow } from "./db";
import { romeDay } from "./day";
import { ApiError } from "./errors";
import { hmacHex } from "./hmac";
import { secondsToRomeMidnight } from "./quota";

/** Durable, purpose-separated installation + venue + drink claims; no daily salt or raw ID at rest. */
export function recommendationClaims(env: Env, voter: string, venue: string): Promise<string[]> {
  return Promise.all(
    CATALOG.map(({ code }) =>
      hmacHex(env.HASH_KEY, ["mobile-recommendation-v1", voter, venue, code]),
    ),
  );
}

/** Each true request is an addition attempt, even when the pair is already selected. */
export async function consumeRecommendationQuota(
  env: Env,
  voter: string,
  ip: string,
): Promise<void> {
  const day = romeDay();
  const accepted = await Promise.all(
    (
      [
        ["installation", voter],
        ["ip", ip],
      ] as const
    ).map(async ([kind, value]) => {
      const key = await hmacHex(env.HASH_KEY, [
        day,
        "mobile-recommendation-addition-v1",
        kind,
        value,
      ]);
      return addToCounter(env.DB, key, day, 1, MOBILE_RECOMMENDATION_QUOTAS[kind]);
    }),
  );
  if (accepted.some((ok) => !ok)) {
    throw new ApiError("rate_limited", { "Retry-After": String(secondsToRomeMidnight()) });
  }
}

export function recommendationSnapshot(
  venue: string,
  rows: MobileRecommendationRow[],
): MobileRecommendations {
  const byDrink = new Map(rows.map((row) => [row.drink, row]));
  return {
    venue_key: venue,
    drinks: CATALOG.map(({ code }) => {
      const row = byDrink.get(code);
      const count = row?.count ?? 0;
      if (!Number.isSafeInteger(count) || count < 0) throw new ApiError("internal");
      return { drink: code, count, recommended: row?.recommended === 1 };
    }),
  };
}
