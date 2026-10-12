// HMAC-SHA256 with WebCrypto. Keys for counters/dedup never contain a sid or an IP in clear (SPEC 8).
const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

function importKey(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    keys.set(secret, key);
  }
  return key;
}

const toHex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** HMAC of the parts joined by a separator that cannot appear in them, hex, 32 chars (SPEC 8). */
export async function hmacHex(secret: string, parts: string[]): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importKey(secret),
    encoder.encode(parts.join("\u0000")),
  );
  return toHex(signature).slice(0, 32);
}

export async function sign(secret: string, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign("HMAC", await importKey(secret), data));
}

/** Constant-time check through WebCrypto (SPEC 13.2). */
export async function verify(
  secret: string,
  signature: Uint8Array,
  data: Uint8Array,
): Promise<boolean> {
  return crypto.subtle.verify("HMAC", await importKey(secret), signature, data);
}
