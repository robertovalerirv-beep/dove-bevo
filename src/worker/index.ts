import { Hono } from "hono";
import { routePath } from "hono/route";
import { version } from "../../package.json";
import { apiError } from "./lib/errors";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ status: "ok", version, data_version: c.env.DATA_VERSION }));

app.notFound((c) => apiError(c, "not_found"));

app.onError((_err, c) => {
  // Log only code and route pattern, never params, bodies or the error text (SPEC 13.8).
  console.error(JSON.stringify({ code: "internal", route: routePath(c) }));
  return apiError(c, "internal");
});

export default app;
