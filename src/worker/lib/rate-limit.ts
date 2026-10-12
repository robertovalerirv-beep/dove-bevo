// Burst limit per IP with the Workers Rate Limiting binding (SPEC 13.3, ADR 0010). The key is an
// HMAC of the IP: the binding never sees an address. Per location and eventually consistent.
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { romeDay } from "./day";
import { ApiError } from "./errors";
import { hmacHex } from "./hmac";
import { clientIp } from "./quota";

const PERIOD_S = 10; // binding period in wrangler.jsonc

export const rateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const key = await hmacHex(c.env.HASH_KEY, [romeDay(), "burst", clientIp(c.req.raw)]);
  const { success } = await c.env.RATE_LIMITER.limit({ key });
  if (!success) throw new ApiError("rate_limited", { "Retry-After": String(PERIOD_S) });
  await next();
};
