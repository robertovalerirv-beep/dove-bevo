import { z } from "zod";
import { MOBILE_CLIENT_ID, MOBILE_SESSION_TTL_S } from "../../shared/mobile";
import { sign, verify } from "./hmac";

const encoder = new TextEncoder();
export const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
export const randomMobileValue = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

export async function mobileHash(value: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

const Payload = z.strictObject({
  v: z.literal(1),
  aud: z.literal(MOBILE_CLIENT_ID),
  env: z.url(),
  id: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  exp: z.number().int().positive(),
});

// Distinct derived key, signed message prefix AND three-part encoding: neither token validator can
// accept the other format, even if the audience check were accidentally dropped later.
async function mobileKey(secret: string): Promise<string> {
  return base64url(await sign(secret, encoder.encode("dovebevo/mobile-preview/session/v1")));
}

export async function createMobileSession(secret: string, environment: string, now = Date.now()) {
  const id = randomMobileValue();
  const encoded = base64url(
    encoder.encode(
      JSON.stringify({
        v: 1,
        aud: MOBILE_CLIENT_ID,
        env: environment,
        id,
        exp: Math.floor(now / 1000) + MOBILE_SESSION_TTL_S,
      }),
    ),
  );
  const message = `dvm1.${encoded}`;
  return {
    token: `${message}.${base64url(await sign(await mobileKey(secret), encoder.encode(message)))}`,
    id,
  };
}

export async function readMobileSession(
  secret: string,
  token: string,
  environment: string,
  now = Date.now(),
): Promise<string | null> {
  if (token.length > 1024) return null;
  const [version, encoded = "", signature = "", extra] = token.split(".");
  if (
    version !== "dvm1" ||
    extra !== undefined ||
    !/^[A-Za-z0-9_-]+$/.test(encoded) ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  )
    return null;
  try {
    const bytes = Uint8Array.from(atob(signature.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
      c.charCodeAt(0),
    );
    if (!(await verify(await mobileKey(secret), bytes, encoder.encode(`dvm1.${encoded}`))))
      return null;
    const payload = Payload.safeParse(
      JSON.parse(atob(encoded.replaceAll("-", "+").replaceAll("_", "/"))),
    );
    if (
      !payload.success ||
      payload.data.env !== environment ||
      payload.data.exp * 1000 <= now ||
      payload.data.exp * 1000 > now + MOBILE_SESSION_TTL_S * 1000
    )
      return null;
    return payload.data.id;
  } catch {
    return null;
  }
}
