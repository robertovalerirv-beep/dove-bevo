import { expect, test } from "@playwright/test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// M5-08 (SPEC 13.6): no secret in the bundle. The browser files never mention the names of the
// secrets (they live only in the Worker's environment); nothing in the build looks like a key.
const SECRET_NAMES = /TURNSTILE_SECRET|SESSION_HMAC_KEY|HASH_KEY|CLOUDFLARE_API_TOKEN|ACCESS_AUD/;
const KEY_FORMATS: [string, RegExp][] = [
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["private JWK", /"kty"\s*:\s*"(?:RSA|EC)"[^}]*"d"\s*:/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["Cloudflare API token", /\b[A-Za-z0-9_-]{40}\b(?=.{0,40}cloudflare)/i],
  ["long hex secret assigned", /(?:secret|password|token)\s*[:=]\s*["'][0-9a-f]{32,}["']/i],
];
const TEXT = /\.(js|mjs|css|html|json|txt|webmanifest|svg|map)$/;

function* files(path: string): Generator<string> {
  if (!existsSync(path)) return;
  if (statSync(path).isFile()) {
    yield path;
    return;
  }
  for (const name of readdirSync(path)) {
    if (name === "data") continue; // OpenStreetMap bar names, not our code
    yield* files(join(path, name));
  }
}

const built = () => [...files("dist")].filter((f) => TEXT.test(f));

test("the build exists", () => {
  expect(built().length).toBeGreaterThan(5);
});

test("the files sent to the browser never name a secret", () => {
  const hits = [...files("dist/client")]
    .filter((f) => TEXT.test(f))
    .flatMap((f) => {
      const match = SECRET_NAMES.exec(readFileSync(f, "utf8"));
      return match ? [`${f}: ${match[0]}`] : [];
    });
  expect(hits).toEqual([]);
});

test("nothing in the build looks like a key, a token or a private key", () => {
  const hits = built().flatMap((f) => {
    const text = readFileSync(f, "utf8");
    return KEY_FORMATS.filter(([, re]) => re.test(text)).map(([label]) => `${f}: ${label}`);
  });
  expect(hits).toEqual([]);
});

test("the test signing key of the Access JWT is not in the build", () => {
  const hits = built().filter((f) =>
    /TEST_ACCESS_PRIVATE_JWK|test-access/i.test(readFileSync(f, "utf8")),
  );
  expect(hits).toEqual([]);
});
