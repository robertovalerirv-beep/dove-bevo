import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { ApiError } from "./errors";

// SECURITY: This Worker MUST be deployed behind a Cloudflare Access application
// on its route. The Cf-Access-Jwt-Assertion header is set by Cloudflare Access
// at the edge and must not be forgeable by clients. If Access is not configured,
// the ACCESS_TEAM_DOMAIN and ACCESS_AUD bindings will be empty and this guard
// will reject all admin requests with 403.
//
// Cloudflare Access protects /admin* and /api/admin/*; the Worker verifies the JWT anyway (D-19):
// RS256 signature with the team's public keys, audience, issuer and expiry.

interface Jwk extends JsonWebKey {
  kid: string;
}

const keyCache = new Map<string, { at: number; keys: Jwk[] }>();
const KEYS_TTL_MS = 10 * 60_000;
/** An unknown `kid` may ask for the keys again only this long after the last download (audit 28/10/2026). */
const REFRESH_MIN_MS = 30_000;
/** One team in practice; a few more are tolerated, the oldest entry goes first. */
const KEY_CACHE_MAX = 4;

async function teamKeys(team: string, refresh: boolean): Promise<Jwk[]> {
  const cached = keyCache.get(team);
  // A refresh (unknown `kid`) is a rotation only if the keys are not brand new: anyone can send a well-formed
  // token with a made-up `kid`, which must not cost a download each time.
  if (cached && Date.now() - cached.at < (refresh ? REFRESH_MIN_MS : KEYS_TTL_MS))
    return cached.keys;
  const response = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!response.ok) throw new ApiError("forbidden");
  const { keys } = await response.json<{ keys: Jwk[] }>();
  keyCache.delete(team); // a refreshed team goes to the back of the insertion order
  if (keyCache.size >= KEY_CACHE_MAX) {
    const oldest = keyCache.keys().next().value;
    if (oldest) keyCache.delete(oldest);
  }
  keyCache.set(team, { at: Date.now(), keys });
  return keys;
}

const fromB64url = (part: string) =>
  Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));
const decodeJson = (part: string): unknown =>
  JSON.parse(new TextDecoder().decode(fromB64url(part)));

/** True when the token is a valid Access JWT for this application. */
export async function verifyAccessJwt(token: string, team: string, aud: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3 || !team || !aud) return false;
  const [head, body, signature] = parts as [string, string, string];
  let header: { alg?: string; kid?: string };
  let claims: { aud?: string | string[]; exp?: number; nbf?: number; iss?: string };
  try {
    header = decodeJson(head) as typeof header;
    claims = decodeJson(body) as typeof claims;
  } catch {
    return false;
  }
  if (header.alg !== "RS256" || !header.kid) return false;
  const now = Date.now() / 1000;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(aud)) return false;
  if (typeof claims.exp !== "number" || claims.exp <= now) return false;
  if (typeof claims.nbf === "number" && claims.nbf > now + 60) return false;
  if (claims.iss !== `https://${team}`) return false;

  let jwk = (await teamKeys(team, false)).find((k) => k.kid === header.kid);
  jwk ??= (await teamKeys(team, true)).find((k) => k.kid === header.kid); // key rotation
  if (!jwk) return false;
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    fromB64url(signature),
    new TextEncoder().encode(`${head}.${body}`),
  );
}

/** Every /api/admin/* request needs a valid Access JWT, else 403 (SPEC 9.2, M5-02). */
export const requireAccess: MiddlewareHandler<AppEnv> = async (c, next) => {
  // Defense in depth: without an Access application configured nothing here can be trusted.
  if (!c.env.ACCESS_TEAM_DOMAIN || !c.env.ACCESS_AUD) {
    throw new ApiError("forbidden");
  }
  const token = c.req.header("Cf-Access-Jwt-Assertion") ?? "";
  const ok = await verifyAccessJwt(token, c.env.ACCESS_TEAM_DOMAIN, c.env.ACCESS_AUD).catch(
    () => false,
  );
  if (!ok) throw new ApiError("forbidden");
  await next();
};
