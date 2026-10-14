// Burst limits per IP with the Workers Rate Limiting binding (SPEC 13.3, ADR 0010, ADR 0021). The
// key is an HMAC of the IP: the binding never sees an address. Per location, eventually consistent.
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { romeDay } from "./day";
import { ApiError } from "./errors";
import { hmacHex } from "./hmac";
import { clientIp } from "./quota";

type Limiter = "RATE_LIMITER" | "READ_LIMITER";

const limiter =
  (binding: Limiter, periodSeconds: number): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const key = await hmacHex(c.env.HASH_KEY, [romeDay(), binding, clientIp(c.req.raw)]);
    const { success } = await c.env[binding].limit({ key });
    if (!success) throw new ApiError("rate_limited", { "Retry-After": String(periodSeconds) });
    await next();
  };

/** Writes and the per-bar history: 20 requests / 10 s (period in wrangler.jsonc). */
export const rateLimit = limiter("RATE_LIMITER", 10);
/** Cell reads: more generous (a map view loads up to 12 cells), 100 requests / 60 s on staging. */
export const readLimit = limiter("READ_LIMITER", 60);
