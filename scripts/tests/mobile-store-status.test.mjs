import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import { collectStatus, publicState, requests, tokenFor } from "../mobile-store-status.mjs";

const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const env = {
  DOVEBEVO_ASC_KEY_ID: "ABCDEFGHIJ",
  DOVEBEVO_ASC_ISSUER_ID: "00000000-0000-4000-8000-000000000000",
  DOVEBEVO_ASC_PRIVATE_KEY: pair.privateKey.export({ type: "pkcs8", format: "pem" }),
};

test("short-lived P256 JWT verifies using an independently generated public key", () => {
  const token = tokenFor(env, 1000);
  const [header, payload, signature] = token.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url")), {
    iss: env.DOVEBEVO_ASC_ISSUER_ID,
    iat: 995,
    exp: 1180,
    aud: "appstoreconnect-v1",
  });
  assert.equal(
    verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      { key: pair.publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url"),
    ),
    true,
  );
  assert.throws(() => tokenFor({ ...env, DOVEBEVO_ASC_KEY_ID: "" }));
  assert.throws(() => tokenFor({ ...env, DOVEBEVO_ASC_PRIVATE_KEY: "invalid" }));
});

test("only release state fields survive; contacts, keys, tokens and links are discarded", () => {
  const value = publicState({
    data: [
      {
        type: "appStoreVersions",
        id: "123",
        attributes: {
          versionString: "1.0.0",
          appVersionState: "WAITING_FOR_REVIEW",
          email: "private@example.test",
          token: "secret",
        },
        relationships: { build: { data: { type: "builds", id: "456" } } },
      },
    ],
    links: { next: "https://evil.test" },
  });
  assert.deepEqual(value[0], {
    type: "appStoreVersions",
    id: "123",
    attributes: { versionString: "1.0.0", appVersionState: "WAITING_FOR_REVIEW" },
    relationships: { build: { type: "builds", id: "456" } },
  });
  assert.throws(() => publicState({ data: [{ type: "users", id: "1", attributes: {} }] }));
});

test("transport is fixed GET only and receipts never contain authentication", async () => {
  let calls = 0;
  const result = await collectStatus(env, async (url, options) => {
    assert.equal(url, "https://api.appstoreconnect.apple.com" + requests[calls++]);
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.ok(options.headers.Authorization.startsWith("Bearer "));
    return new globalThis.Response(JSON.stringify({ data: [] }), {
      headers: { "Content-Type": "application/json" },
    });
  });
  assert.equal(calls, 2);
  assert.equal(result.complete, true);
  assert.ok(!JSON.stringify(result).includes("Bearer"));
});

test("provider failures and oversized responses fail closed without error bodies", async () => {
  for (const transport of [
    async () => new globalThis.Response("private response", { status: 401 }),
    async () => new globalThis.Response("x".repeat(262145)),
    async () => {
      throw new Error("Bearer secret");
    },
  ]) {
    const result = await collectStatus(env, transport);
    assert.equal(result.complete, false);
    assert.ok(!JSON.stringify(result).includes("private response"));
    assert.ok(!JSON.stringify(result).includes("secret"));
  }
});
