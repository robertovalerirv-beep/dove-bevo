import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { cpSync } from "node:fs";
import { defineConfig } from "vitest/config";

// ASSETS in tests: the wrangler.jsonc assets directory (dist/client) serves the versioned fixture
// under /data/fixture/, with or without a build (CI runs the tests before building).
cpSync("tests/fixtures/data", "dist/client/data/fixture", { recursive: true });

// Cloudflare Access in tests: a key pair made at start-up (never stored), public half served as the
// team certs, private half given to the tests to sign JWTs.
const ACCESS_TEAM = "test.cloudflareaccess.com";
const accessKeys = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);
const accessPublic = { ...(await crypto.subtle.exportKey("jwk", accessKeys.publicKey)), kid: "k1" };
const accessPrivate = await crypto.subtle.exportKey("jwk", accessKeys.privateKey);

const usedTokens = new Set<string>();
async function fakeSiteverify(request: Request): Promise<Response> {
  if (request.url === `https://${ACCESS_TEAM}/cdn-cgi/access/certs`) {
    return Response.json({ keys: [accessPublic] });
  }
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
                  TURNSTILE_HOSTNAME: "dovebevo.example",
                  ACCESS_TEAM_DOMAIN: ACCESS_TEAM,
                  ACCESS_AUD: "test-aud",
                  TEST_ACCESS_PRIVATE_JWK: JSON.stringify(accessPrivate),
                },
                // Fake Turnstile siteverify ("ok-*" tokens pass once) and Access team certs.
                outboundService: fakeSiteverify,
              },
            }),
          ],
          test: {
            name: "worker",
            // Files share the local D1 and the rate limiter: run them one after the other.
            fileParallelism: false,
            include: ["tests/worker/**/*.test.ts"],
            setupFiles: ["tests/worker/apply-migrations.ts"],
          },
        },
      ],
    },
  };
});
