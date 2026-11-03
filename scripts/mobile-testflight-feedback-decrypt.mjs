// Local-only operator for the encrypted TestFlight artifact. The private key
// must come from the owner's protected host store, never source or OneDrive.
import { Buffer } from "node:buffer";
import { createDecipheriv, createPrivateKey, privateDecrypt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_ENVELOPE_BYTES = 60 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function decoded(value, maximum) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw new Error("Invalid encrypted artifact");
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength > maximum) throw new Error("Encrypted artifact too large");
  return bytes;
}

export function decryptFeedback(envelopeText, privateKeyPem) {
  const envelope = JSON.parse(envelopeText);
  if (envelope?.schema_version !== 1 || envelope.encryption !== "RSA-OAEP-SHA256+A256GCM")
    throw new Error("Unexpected feedback encryption");
  const privateKey = createPrivateKey(privateKeyPem);
  if (
    privateKey.asymmetricKeyType !== "rsa" ||
    (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 3072
  )
    throw new Error("Unexpected feedback decryption key");
  const key = privateDecrypt(
    { key: privateKey, oaepHash: "sha256" },
    decoded(envelope.wrapped_key, 512),
  );
  const nonce = decoded(envelope.nonce, 12);
  const tag = decoded(envelope.tag, 16);
  if (key.length !== 32 || nonce.length !== 12 || tag.length !== 16)
    throw new Error("Invalid encrypted artifact");
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(decoded(envelope.ciphertext, MAX_ENVELOPE_BYTES)),
    decipher.final(),
  ]);
  const payload = JSON.parse(plaintext.toString("utf8"));
  if (
    payload?.result?.schema_version !== 1 ||
    payload.result.app_id !== "6827324444" ||
    payload.result.complete !== true ||
    !Array.isArray(payload.result.feedback) ||
    payload.result.feedback.length > 200 ||
    !Array.isArray(payload.images) ||
    payload.images.length > 40
  )
    throw new Error("Unexpected feedback payload");
  return payload;
}

export async function saveFeedback(payload, outputDirectory) {
  const base = resolve(".task-tmp");
  const target = resolve(outputDirectory);
  const inside = relative(base, target);
  if (!inside || inside.startsWith("..") || isAbsolute(inside))
    throw new Error("Feedback output must be project-local");
  await mkdir(target, { recursive: false, mode: 0o700 });
  await writeFile(join(target, "feedback.json"), JSON.stringify(payload.result, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  for (const image of payload.images) {
    if (!image || !/^feedback-\d{3}-[1-5]\.(png|jpg|heic|heif)$/.test(image.filename))
      throw new Error("Unexpected feedback image name");
    const bytes = decoded(image.base64, MAX_IMAGE_BYTES);
    await writeFile(join(target, image.filename), bytes, { flag: "wx", mode: 0o600 });
  }
  return { feedback_count: payload.result.feedback_count, image_count: payload.images.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 5) throw new Error("Expected encrypted file, key and output");
    const ciphertext = await readFile(process.argv[2], "utf8");
    const privateKey = await readFile(process.argv[3], "utf8");
    const result = await saveFeedback(decryptFeedback(ciphertext, privateKey), process.argv[4]);
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch {
    process.stderr.write("TestFlight feedback decryption unavailable\n");
    process.exitCode = 2;
  }
}
