import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const usedTokens = new Set<string>();
async function fakeSiteverify(request: Request): Promise<Response> {
  if (!request.url.startsWith("https://challenges.cloudflare.com/turnstile/v0/siteverify")) {
    return new Response("blocked in tests", { status: 502 });
  }
  const form = await request.formData();
  const field = form.get("response");
  const token = typeof field === "string" ? field : "";
  const reused = usedTokens.has(token);
  usedTokens.add(token);
  const ok = token.startsWith("ok-") && !reused && form.get("secret") === "test-turnstile-secret";
  return Response.json({
    success: ok,
    hostname: token === "ok-otherhost" ? "evil.example" : "dovebevo.example",
    action: token === "ok-otheraction" ? "login" : "contribute",
    "error-codes": ok ? [] : [reused ? "timeout-or-duplicate" : "invalid-input-response"],
    remoteip_sent: form.has("remoteip"),
  });
}

export default defineConfig(async () => {
  const migrations = await readD1Migrations("migrations");
  return {
    test: {
      projects: [
        // Pure modules and scripts, in Node.
        { test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
        // Worker routes inside workerd, with a local D1 migrated before each file.
        {
          plugins: [
            cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
              miniflare: {
                // Test-only values, never real secrets.
                bindings: {
                  TEST_MIGRATIONS: migrations,
                  SESSION_HMAC_KEY: "test-session-hmac-key",
                  HASH_KEY: "test-hash-key",
                  TURNSTILE_SECRET: "test-turnstile-secret",
                },
                // Fake Turnstile siteverify: "ok-*" tokens pass once, anything else fails.
                outboundService: fakeSiteverify,
              },
            }),
          ],
          test: {
            name: "worker",
            include: ["tests/worker/**/*.test.ts"],
            setupFiles: ["tests/worker/apply-migrations.ts"],
          },
        },
      ],
    },
  };
});
