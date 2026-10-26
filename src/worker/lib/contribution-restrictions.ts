import type { Context } from "hono";
import { RESTRICTION_CAPACITY } from "../../shared/contribution-restrictions";
import type { AppEnv } from "../types";
import { listContributionRestrictions, matchesDedup } from "./db";
import { romeDay } from "./day";
import { ApiError } from "./errors";
import { hmacHex } from "./hmac";
import { clientIp } from "./quota";

const shiftDay = (day: string, count: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + count * 86_400_000).toISOString().slice(0, 10);

export function retainedRestrictionDays(now = Date.now()): string[] {
  const today = romeDay(new Date(now));
  return [today, shiftDay(today, -1)];
}

/** Rome midnight after the last retained day. EU DST switches happen after midnight. */
export function restrictionExpiry(day: string): number {
  const midnightUtc = Date.parse(`${shiftDay(day, 2)}T00:00:00Z`);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(midnightUtc)),
  );
  return midnightUtc - hour * 3_600_000;
}

/** No mutation: candidate HMACs live only for this request; one indexed membership query. */
export async function isContributionRestricted(
  env: Pick<Env, "DB" | "HASH_KEY">,
  who: { sid: string; ip: string },
  now = Date.now(),
): Promise<boolean> {
  const days = retainedRestrictionDays(now);
  const refs = await listContributionRestrictions(env.DB, now);
  // Do not silently ignore an active reference if a future bug or manual DB write exceeds the cap.
  if (refs.length > RESTRICTION_CAPACITY) throw new ApiError("busy");
  const keys = await Promise.all(
    refs
      .filter((r) => days.includes(r.day))
      .flatMap((r) =>
        r.family === "price"
          ? [
              hmacHex(env.HASH_KEY, [r.day, "author", "sid", who.sid, r.target]),
              hmacHex(env.HASH_KEY, [r.day, "author", "ip", who.ip, r.target]),
            ]
          : [
              hmacHex(env.HASH_KEY, [r.day, "propose-sid", who.sid, r.target]),
              hmacHex(env.HASH_KEY, [r.day, "propose-ip", who.ip, r.target]),
            ],
      ),
  );
  return matchesDedup(env.DB, keys, days);
}

/** Called only inside authenticated shared write handlers, after the global burst gate. */
export async function requireContributionAllowed(c: Context<AppEnv>): Promise<void> {
  if (await isContributionRestricted(c.env, { sid: c.var.sid, ip: clientIp(c.req.raw) }))
    throw new ApiError("contribution_restricted");
}
