import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { hmacHex, sign, verify } from "../../src/worker/lib/hmac";
import { requireAccess } from "../../src/worker/lib/access";
import { ApiError } from "../../src/worker/lib/errors";
import { Hono } from "hono";
import type { AppEnv } from "../../src/worker/types";
import { accessJwt } from "./access-jwt";

// ADR 0025 (A3, A5): defence in depth on the admin guard and bounded caches of imported keys.
describe("requireAccess without an Access application configured (A3)", () => {
  const app = new Hono<AppEnv>();
  app.use(requireAccess);
  app.get("/", (c) => c.text("admin"));
  app.onError((error, c) =>
    c.json({ code: error instanceof ApiError ? error.code : "other" }, 403),
  );
  const call = async (bindings: Partial<Env>, jwt: string) =>
    app.fetch(
      new Request("https://dovebevo.example/", { headers: { "Cf-Access-Jwt-Assertion": jwt } }),
      { ...env, ...bindings },
    );

  it("answers 403 whatever the token, when the team domain or the audience is empty", async () => {
    const jwt = await accessJwt();
    expect((await call({ ACCESS_TEAM_DOMAIN: "" }, jwt)).status).toBe(403);
    expect((await call({ ACCESS_AUD: "" }, jwt)).status).toBe(403);
    expect((await call({ ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: "" }, jwt)).status).toBe(403);
  });

  it("still lets a valid token through when both are set", async () => {
    expect((await call({}, await accessJwt())).status).toBe(200);
  });
});

describe("imported HMAC keys are bounded (A5)", () => {
  it("many different secrets keep working, and the same secret always gives the same answer", async () => {
    const first = await hmacHex("secret-0", ["a", "b"]);
    for (let i = 1; i < 30; i++) {
      expect(await hmacHex(`secret-${String(i)}`, ["a", "b"])).toHaveLength(32);
    }
    // secret-0 was evicted long ago: it is imported again, with the same result
    expect(await hmacHex("secret-0", ["a", "b"])).toBe(first);
    const data = new TextEncoder().encode("payload");
    expect(await verify("secret-0", await sign("secret-0", data), data)).toBe(true);
    expect(await verify("secret-1", await sign("secret-0", data), data)).toBe(false);
  });
});
