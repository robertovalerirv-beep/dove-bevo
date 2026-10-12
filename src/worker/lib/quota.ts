// Daily quotas per session AND per IP, keyed by HMAC with the day as salt (SPEC 13.3, ADR 0005).
import { QUOTAS, type QuotaKind } from "../config";
import { addToCounter } from "./db";
import { romeDay } from "./day";
import { ApiError } from "./errors";
import { hmacHex } from "./hmac";

/** Seconds until midnight in Europe/Rome, for Retry-After. */
export function secondsToRomeMidnight(at = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Math.max(1, 86_400 - (get("hour") * 3600 + get("minute") * 60 + get("second")));
}

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

export async function consumeQuota(
  env: Env,
  kind: QuotaKind,
  sid: string,
  ip: string,
  amount = 1,
): Promise<void> {
  const day = romeDay();
  const limit = QUOTAS[kind];
  for (const [who, id] of [
    ["ip", ip],
    ["sid", sid],
  ] as const) {
    const key = await hmacHex(env.HASH_KEY, [day, kind, who, id]);
    if (!(await addToCounter(env.DB, key, day, amount, limit))) {
      throw new ApiError("rate_limited", { "Retry-After": String(secondsToRomeMidnight()) });
    }
  }
}
