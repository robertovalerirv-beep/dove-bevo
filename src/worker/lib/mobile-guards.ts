import type { MiddlewareHandler } from "hono";
import { MOBILE_NATIVE_HEADER, MOBILE_REDEEM_PATH } from "../../shared/mobile";
import type { AppEnv } from "../types";
import { ApiError } from "./errors";
import { requireOrigin } from "./guards";
import { readMobileSession } from "./mobile-auth";

const MOBILE_POSTS = new Set([
  "/api/mobile/authorize",
  MOBILE_REDEEM_PATH,
  "/api/mobile/events",
  "/api/mobile/prices",
  "/api/mobile/prices/confirm",
  "/api/mobile/reports",
  "/api/mobile/venues",
]);

/** Only exact reviewed method/path pairs get the native origin exception. Unknown, encoded and
 * similarly named paths remain behind the website's existing Origin checks. */
export const apiBoundary: MiddlewareHandler<AppEnv> = async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const namespace = path === "/api/mobile" || path.startsWith("/api/mobile/");
  if (namespace && c.env.MOBILE_PREVIEW_ENABLED !== "true") throw new ApiError("not_found");
  const mobile =
    (c.req.method === "GET" && path === "/api/mobile/config") ||
    (c.req.method === "POST" && MOBILE_POSTS.has(path));
  if (!mobile) {
    if (/^Bearer dvm1\./i.test(c.req.header("Authorization") ?? ""))
      throw new ApiError("unauthorized");
    return requireOrigin(c, async () => {
      if (namespace) throw new ApiError("not_found");
      await next();
    });
  }
  // The configured challenge hostname is also the exact preview environment identity. Host headers
  // or aliases must not silently create additional client/environment pairs.
  if (new URL(c.req.url).origin !== `https://${c.env.TURNSTILE_HOSTNAME}`) {
    throw new ApiError("forbidden");
  }
  c.header("Cache-Control", "no-store");
  if (path === "/api/mobile/config") return next();
  if (path === "/api/mobile/authorize") return requireOrigin(c, next);
  const origin = c.req.header("Origin");
  if (
    c.req.header(MOBILE_NATIVE_HEADER) !== "1" ||
    (origin !== undefined && origin !== new URL(c.req.url).origin)
  )
    throw new ApiError("forbidden");
  // No ambient credentials on native requests; events are deliberately identifier-free.
  if (c.req.header("Cookie")) throw new ApiError("unauthorized");
  if (path === "/api/mobile/events" || path === MOBILE_REDEEM_PATH) {
    if (c.req.header("Authorization")) throw new ApiError("unauthorized");
    return next();
  }
  const authorization = c.req.header("Authorization") ?? "";
  const sid = authorization.startsWith("Bearer ")
    ? await readMobileSession(
        c.env.SESSION_HMAC_KEY,
        authorization.slice(7),
        new URL(c.req.url).origin,
      )
    : null;
  if (!sid) throw new ApiError("unauthorized");
  c.set("sid", sid);
  await next();
};
