import { Hono } from "hono";
import { routePath } from "hono/route";
import { version } from "../../package.json";
import { apiError } from "./lib/errors";
import { securityHeaders } from "./lib/security-headers";
import { prices } from "./routes/prices";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.use(async (c, next) => {
  c.set("start", Date.now());
  await next();
});
app.use(securityHeaders);

app.get("/api/health", (c) => c.json({ status: "ok", version, data_version: c.env.DATA_VERSION }));

app.route("/api/prices", prices);

app.notFound((c) => apiError(c, "not_found"));

app.onError((_err, c) => {
  // Log only code, route pattern and duration; never params, bodies or the error text (SPEC 13.8).
  const ms = Date.now() - c.get("start");
  console.error(JSON.stringify({ code: "internal", route: routePath(c), ms }));
  return apiError(c, "internal");
});

export default app;
