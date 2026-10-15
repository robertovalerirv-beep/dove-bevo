import { env, exports } from "cloudflare:workers";

// Shared by the admin tests: a JWT like the one Cloudflare Access adds, signed with the test key.
export const ORIGIN = "https://dovebevo.example";
const TEAM = "test.cloudflareaccess.com";
const { TEST_ACCESS_PRIVATE_JWK } = env as unknown as { TEST_ACCESS_PRIVATE_JWK: string };

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const encode = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

/** A JWT like the one Cloudflare Access adds, signed with the test key (or a forged one). */
export async function accessJwt(
  claims: Record<string, unknown> = {},
  forged = false,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = encode({ alg: "RS256", kid: "k1", typ: "JWT" });
  const body = encode({ aud: ["test-aud"], iss: `https://${TEAM}`, exp: now + 600, ...claims });
  const key = forged
    ? (
        (await crypto.subtle.generateKey(
          {
            name: "RSASSA-PKCS1-v1_5",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
          },
          false,
          ["sign"],
        )) as CryptoKeyPair
      ).privateKey
    : await crypto.subtle.importKey(
        "jwk",
        JSON.parse(TEST_ACCESS_PRIVATE_JWK) as JsonWebKey,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
      );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${b64url(new Uint8Array(signature))}`;
}

export function call(path: string, jwt: string | null, body?: unknown) {
  const headers: Record<string, string> = { Origin: ORIGIN };
  if (jwt) headers["Cf-Access-Jwt-Assertion"] = jwt;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return exports.default.fetch(`${ORIGIN}/api/admin/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
