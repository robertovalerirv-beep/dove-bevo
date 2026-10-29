import { Hono } from "hono";
import { routePath } from "hono/route";
import { version } from "../../package.json";
import { ApiError, apiError } from "./lib/errors";
import { requireRealSecrets } from "./lib/env-guard";
import { requireOrigin, requireSession } from "./lib/guards";
import { rateLimit, readLimit } from "./lib/rate-limit";
import { securityHeaders } from "./lib/security-headers";
import { KEEP_DAYS } from "./config";
import { romeDay } from "./lib/day";
import { purgeOldKeys } from "./lib/db";
import { requireAccess } from "./lib/access";
import { admin } from "./routes/admin";
import { events } from "./routes/events";
import { prices } from "./routes/prices";
import { reports } from "./routes/reports";
import { seo, seoPages } from "./routes/seo";
import { session } from "./routes/session";
import { venues } from "./routes/venues";
import { mobileRecommendations } from "./routes/mobile-recommendations";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.use(async (c, next) => {
  c.set("start", Date.now());
  await next();
});
app.use(securityHeaders);
// After securityHeaders: the tags and text for crawlers are added to the shell, then the headers are set.
app.use(seoPages);
app.use("/api/*", requireOrigin);
// A deployed Worker with the development placeholder keys must not accept sessions or writes.
app.on("POST", "/api/*", requireRealSecrets);
// Burst limit on every write and on the per-bar history (SPEC 9.2, 13.3).
app.on("POST", "/api/*", rateLimit);
app.get("/api/venues/*", rateLimit);
// Admin reads too: a flood of forged tokens must not reach the key download or the database (audit 28/10/2026).
app.get("/api/admin/*", rateLimit);
// Cell reads hit D1 on every call (the Cache API is inactive on workers.dev): one script must not
// burn the free-plan quota in minutes (red-team audit 14/10/2026, ADR 0021).
app.get("/api/prices/*", readLimit);
app.get("/api/mobile/venues/*", readLimit);
// Website contribution writes need a session (SPEC 9.1; /api/events is exempt by D-06).
// Apps-only recommendations use their separately validated anonymous installation claim (ADR 0041).
app.on(
  "POST",
  ["/api/prices", "/api/prices/*", "/api/reports", "/api/venues", "/api/venues/*"],
  requireSession,
);

app.get("/api/health", (c) => c.json({ status: "ok", version, data_version: c.env.DATA_VERSION }));

// Admin: Cloudflare Access JWT verified by the Worker too (D-19); Origin is checked above.
app.use("/api/admin/*", requireAccess);
app.route("/api/admin", admin);
app.route("/api/session", session);
app.route("/api/prices", prices);
app.route("/api/venues", venues);
app.route("/api/reports", reports);
app.route("/api/events", events);
app.route("/api/mobile/venues", mobileRecommendations);
app.route("/", seo);

// Pages that run the Worker first (run_worker_first in wrangler.jsonc: the home, /copertura, the main
// cities, /bar/*) are handed to the static assets; the copy has headers the middleware can change.
app.all("*", async (c) => {
  if (new URL(c.req.url).pathname.startsWith("/api/")) return apiError(c, "not_found");
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  return new Response(asset.body, asset);
});

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
  /** Hourly cron (one per environment): purge day-salted keys older than KEEP_DAYS (ADR 0016). */
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    // Calendar arithmetic on the Rome date, so DST days (23 or 25 h) do not shift the cut.
    const today = Date.parse(`${romeDay()}T12:00:00Z`);
    const oldestKept = new Date(today - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
    await purgeOldKeys(env.DB, oldestKept);
  },
} satisfies ExportedHandler<Env>;
