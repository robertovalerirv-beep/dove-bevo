// Anonymous session (SPEC 13.2, ADR 0005): __Host-sid = base64url(random 128-bit id ‖ expiry) . HMAC.
// No session table: the cookie is checked by its signature alone.
import { sign, verify } from "./hmac";

export const SESSION_COOKIE = "__Host-sid";
export const SESSION_TTL_S = 30 * 60;

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

function fromB64url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function createSession(
  secret: string,
  now = Date.now(),
): Promise<{ token: string; id: string }> {
  const payload = new Uint8Array(24);
  crypto.getRandomValues(payload.subarray(0, 16));
  new DataView(payload.buffer).setBigUint64(16, BigInt(Math.floor(now / 1000) + SESSION_TTL_S));
  const signature = await sign(secret, payload);
  return { token: `${b64url(payload)}.${b64url(signature)}`, id: hex(payload.subarray(0, 16)) };
}

/** The session id (hex) when the token is authentic and not expired, otherwise null. */
export async function readSession(
  secret: string,
  token: string,
  now = Date.now(),
): Promise<string | null> {
  const [encoded = "", encodedSig = "", extra] = token.split(".");
  const payload = fromB64url(encoded);
  const signature = fromB64url(encodedSig);
  if (extra !== undefined || payload?.length !== 24 || signature?.length !== 32) return null;
  if (!(await verify(secret, signature, payload))) return null;
  const expires = Number(new DataView(payload.buffer).getBigUint64(16));
  if (expires * 1000 < now) return null;
  return hex(payload.subarray(0, 16));
}
