import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index";
import { isLocalHost, usesPlaceholders } from "../../src/worker/lib/env-guard";
import { createSession } from "../../src/worker/lib/session";

// A Worker deployed with the development placeholders of wrangler.jsonc must not accept sessions or
// writes: the keys are in the public repository (red-team audit 22/10/2026, F-02).
const PLACEHOLDER = "local-dev-only-session-key";
const TEST_SECRET = "1x0000000000000000000000000000000AA";
const placeholders = {
  SESSION_HMAC_KEY: PLACEHOLDER,
  HASH_KEY: "local-dev-only-hash-key",
  TURNSTILE_SECRET: TEST_SECRET,
};

let n = 0;
function post(host: string, path: string, body: unknown, bindings: Partial<Env>, cookie?: string) {
  const request = new Request(`https://${host}${path}`, {
    method: "POST",
    headers: {
      Origin: `https://${host}`,
      "Content-Type": "application/json",
      "CF-Connecting-IP": `203.0.113.${String(++n)}`,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  return worker.fetch(request, { ...env, ...bindings }, createExecutionContext());
}

describe("requireRealSecrets", () => {
  it("answers 503 to a session request when the keys are placeholders on a public host", async () => {
    const response = await post(
      "dovebevo.example",
      "/api/session",
      { token: "ok-g1" },
      placeholders,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "busy" } });
  });

  it("refuses a session forged with the public placeholder key", async () => {
    const { token } = await createSession(PLACEHOLDER);
    const response = await post(
      "dovebevo.example",
      "/api/prices/confirm",
      { venue: "n2420779240", drink: "spritz", hh: 0 },
      placeholders,
      `__Host-sid=${token}`,
    );
    expect(response.status).toBe(503);
  });

  it.each([
    ["session key", { SESSION_HMAC_KEY: PLACEHOLDER }],
    ["hash key", { HASH_KEY: "local-dev-only-hash-key" }],
    ["Turnstile test secret", { TURNSTILE_SECRET: TEST_SECRET }],
    ["empty session key", { SESSION_HMAC_KEY: "" }],
    ["empty Turnstile secret", { TURNSTILE_SECRET: "" }],
  ])("one placeholder is enough: %s", async (_name, bindings) => {
    const response = await post("dovebevo.example", "/api/session", { token: "ok-g2" }, bindings);
    expect(response.status).toBe(503);
  });

  it("lets a request through on localhost and on a private address (dev and e2e)", async () => {
    // The fake siteverify refuses the placeholder secret: 403 means the guard let the request in.
    for (const host of ["localhost", "127.0.0.1", "192.168.1.20", "demo.localhost"]) {
      const response = await post(host, "/api/session", { token: "ok-g3" }, placeholders);
      expect(response.status).toBe(403);
    }
  });

  it("covers every POST, but leaves the admin API to Cloudflare Access", async () => {
    // A route that does not exist yet is covered all the same: the guard answers before the router.
    const later = await post("dovebevo.example", "/api/events", { x: 1 }, placeholders);
    expect(later.status).toBe(503);
    // The admin has no JWT here: 403 from Access (not 503) shows the guard stepped aside.
    const admin = await post("dovebevo.example", "/api/admin/hide", {}, placeholders);
    expect(admin.status).toBe(403);
  });

  it("does nothing with real secrets, and never touches reads", async () => {
    expect((await post("dovebevo.example", "/api/session", { token: "ok-g4" }, {})).status).toBe(
      204,
    );
    const read = await worker.fetch(
      new Request("https://dovebevo.example/api/prices/u0nd9"),
      { ...env, ...placeholders },
      createExecutionContext(),
    );
    expect(read.status).toBe(200);
  });

  it("recognises placeholders and local hosts", () => {
    expect(usesPlaceholders({ ...env, ...placeholders })).toBe(true);
    expect(usesPlaceholders(env)).toBe(false);
    for (const host of [
      "localhost",
      "a.localhost",
      "127.0.0.1",
      "[::1]",
      "10.0.0.2",
      "172.16.0.1",
    ]) {
      expect(isLocalHost(host)).toBe(true);
    }
    for (const host of [
      "dovebevo.example",
      "dovebevo-staging.dovebevo.workers.dev",
      "localhost.evil.com",
      "127.0.0.1.evil.com",
      "172.32.0.1",
      "192.169.1.1",
    ]) {
      expect(isLocalHost(host)).toBe(false);
    }
  });
});
