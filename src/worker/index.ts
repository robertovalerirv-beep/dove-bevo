import { Hono } from "hono";
import { routePath } from "hono/route";
import { version } from "../../package.json";
import { ApiError, apiError } from "./lib/errors";
import { requireOrigin, requireSession } from "./lib/guards";
import { rateLimit } from "./lib/rate-limit";
import { securityHeaders } from "./lib/security-headers";
import { KEEP_DAYS } from "./config";
import { romeDay } from "./lib/day";
import { purgeOldKeys } from "./lib/db";
import { prices } from "./routes/prices";
import { reports } from "./routes/reports";
import { session } from "./routes/session";
import { venues } from "./routes/venues";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.use(async (c, next) => {
  c.set("start", Date.now());
  await next();
});
app.use(securityHeaders);
app.use("/api/*", requireOrigin);
// Burst limit on every write and on the per-bar history (SPEC 9.2, 13.3).
app.on("POST", "/api/*", rateLimit);
app.get("/api/venues/*", rateLimit);
// Every write needs a session, except creating one (SPEC 9.1; /api/events is exempt by D-06).
app.on(
  "POST",
  [
    "/api/prices",
    "/api/prices/*",
    "/api/reports",
    "/api/venues",
    "/api/venues/*",
    "/api/menu-extract",
  ],
  requireSession,
);

app.get("/api/health", (c) => c.json({ status: "ok", version, data_version: c.env.DATA_VERSION }));

app.route("/api/session", session);
app.route("/api/prices", prices);
app.route("/api/venues", venues);
app.route("/api/reports", reports);

app.notFound((c) => apiError(c, "not_found"));

app.onError((err, c) => {
  if (err instanceof ApiError) return apiError(c, err.code, err.headers);
  // Log only code, route pattern and duration; never params, bodies or the error text (SPEC 13.8).
  const ms = Date.now() - c.get("start");
  console.error(JSON.stringify({ code: "internal", route: routePath(c), ms }));
  return apiError(c, "internal");
});

export default {
  fetch: app.fetch,
  /** Nightly cron (one per environment): purge day-salted keys older than KEEP_DAYS (SPEC 8). */
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await purgeOldKeys(env.DB, romeDay(new Date(Date.now() - KEEP_DAYS * 86_400_000)));
  },
} satisfies ExportedHandler<Env>;
