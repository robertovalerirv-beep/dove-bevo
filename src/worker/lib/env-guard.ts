// Fail closed when a deployed Worker still has the development placeholders of wrangler.jsonc: with
// them a session cookie can be forged by anyone who reads the repository and every Turnstile token
// passes. Staging and production define their own secrets; the guard is the last line if one is missed.
import type { MiddlewareHandler } from "hono";
import { routePath } from "hono/route";
import { PLACEHOLDER_PREFIX, TURNSTILE_TEST_SECRET } from "../config";
import type { AppEnv } from "../types";
import { ApiError } from "./errors";

const weak = (key: string) => !key || key.startsWith(PLACEHOLDER_PREFIX);

/** True when the keys or the Turnstile secret are the development placeholders (or missing). */
export const usesPlaceholders = (env: Env): boolean =>
  weak(env.SESSION_HMAC_KEY) ||
  weak(env.HASH_KEY) ||
  !env.TURNSTILE_SECRET ||
  env.TURNSTILE_SECRET === TURNSTILE_TEST_SECRET;

/** localhost, loopback and private networks: where `wrangler dev` and the e2e preview run. */
export function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "[::1]" ||
    /^(127|10)\.\d+\.\d+\.\d+$/.test(hostname) ||
    /^192\.168\.\d+\.\d+$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname)
  );
}

/**
 * Every POST needs real secrets off localhost, so a route added later is covered without a list to
 * update; the admin API is the exception (Cloudflare Access protects it, not these keys). Otherwise
 * 503 and a log line with the code only.
 */
export const requireRealSecrets: MiddlewareHandler<AppEnv> = async (c, next) => {
  const url = new URL(c.req.url);
  if (url.pathname.startsWith("/api/admin/")) return next();
  if (usesPlaceholders(c.env) && !isLocalHost(url.hostname)) {
    console.error(JSON.stringify({ code: "insecure_config", route: routePath(c) }));
    throw new ApiError("busy");
  }
  await next();
};
