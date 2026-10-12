import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createSession } from "../../src/worker/lib/session";

const ORIGIN = "https://dovebevo.example";
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  exports.default.fetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const cookieOf = (response: Response) => response.headers.get("set-cookie") ?? "";

describe("POST /api/session (M2-03)", () => {
  it("issues __Host-sid with the exact attributes and 30 minutes", async () => {
    const response = await post("/api/session", { token: "ok-1" });
    expect(response.status).toBe(204);
    const cookie = cookieOf(response);
    expect(cookie).toMatch(/^__Host-sid=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+; /);
    for (const attribute of ["Path=/", "Secure", "HttpOnly", "SameSite=Strict", "Max-Age=1800"]) {
      expect(cookie.split("; ")).toContain(attribute);
    }
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it("rejects a reused Turnstile token with 403", async () => {
    expect((await post("/api/session", { token: "ok-2" })).status).toBe(204);
    const again = await post("/api/session", { token: "ok-2" });
    expect(again.status).toBe(403);
    expect(await again.json()).toMatchObject({ error: { code: "forbidden" } });
  });

  it("rejects a token for another hostname or action, and invalid tokens", async () => {
    expect((await post("/api/session", { token: "ok-otherhost" })).status).toBe(403);
    expect((await post("/api/session", { token: "ok-otheraction" })).status).toBe(403);
    expect((await post("/api/session", { token: "bad" })).status).toBe(403);
  });
});

describe("session checks on protected POSTs (M2-03)", () => {
  const confirm = (cookie?: string) =>
    post(
      "/api/prices/confirm",
      { venue: "n1", drink: "spritz", size_ml: 0, hh: 0 },
      cookie ? { Cookie: cookie } : {},
    );

  it("401 without a session, with a tampered one and with an expired one", async () => {
    expect((await confirm()).status).toBe(401);
    const { token } = await createSession("test-session-hmac-key");
    expect((await confirm(`__Host-sid=${token.slice(0, -2)}xx`)).status).toBe(401);
    const old = await createSession("test-session-hmac-key", Date.now() - 31 * 60 * 1000);
    expect((await confirm(`__Host-sid=${old.token}`)).status).toBe(401);
    const forged = await createSession("another-key");
    const response = await confirm(`__Host-sid=${forged.token}`);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } });
  });
});

describe("common POST checks (M2-04)", () => {
  it("403 with a foreign or missing Origin", async () => {
    expect(
      (await post("/api/session", { token: "ok-3" }, { Origin: "https://evil.example" })).status,
    ).toBe(403);
    const noOrigin = await exports.default.fetch(`${ORIGIN}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "ok-4" }),
    });
    expect(noOrigin.status).toBe(403);
  });

  it("415 without JSON, 413 over 16 KB (also without Content-Length), 400 with extra fields", async () => {
    expect(
      (await post("/api/session", "token=ok-5", { "Content-Type": "text/plain" })).status,
    ).toBe(415);
    expect((await post("/api/session", { token: "x".repeat(17_000) })).status).toBe(413);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`{"token":"${"y".repeat(20_000)}"}`));
        controller.close();
      },
    });
    const chunked = await exports.default.fetch(`${ORIGIN}/api/session`, {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json" },
      body: stream,
    });
    expect(chunked.status).toBe(413);
    expect((await post("/api/session", { token: "ok-6", admin: true })).status).toBe(400);
    expect((await post("/api/session", "{not json")).status).toBe(400);
  });
});
