// Read-only TestFlight feedback audit. The repository is public, so the Action
// uploads only RSA-wrapped AES-GCM ciphertext. The private key stays on the
// owner's computer outside OneDrive, source, logs, and Actions.
import { Buffer } from "node:buffer";
import { createCipheriv, createPublicKey, publicEncrypt, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL, URL } from "node:url";
import { tokenFor } from "./mobile-store-status.mjs";

const ORIGIN = "https://api.appstoreconnect.apple.com";
const APP_ID = "6827324444";
const PATH = `/v1/apps/${APP_ID}/betaFeedbackScreenshotSubmissions`;
const MAX_PAGES = 5;
const MAX_ROWS = 200;
const MAX_IMAGES = 40;
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 40 * 1024 * 1024;
const initial = new URL(ORIGIN + PATH);
initial.searchParams.set("limit", "200");
initial.searchParams.set("sort", "-createdDate");
initial.searchParams.set(
  "fields[betaFeedbackScreenshotSubmissions]",
  "createdDate,comment,deviceModel,osVersion,screenshots,build",
);
initial.searchParams.set("include", "build");
initial.searchParams.set("fields[builds]", "version");

function validPageUrl(value) {
  const url = new URL(value);
  if (url.origin !== ORIGIN || url.pathname !== PATH || url.username || url.password || url.hash)
    throw new Error("Unexpected feedback page URL");
  return url;
}

function validImageUrl(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !(
      host === "apple.com" ||
      host.endsWith(".apple.com") ||
      host === "mzstatic.com" ||
      host.endsWith(".mzstatic.com")
    )
  )
    throw new Error("Unexpected feedback image host");
  return url;
}

async function bytesOf(response, maximum) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing feedback response body");
  const chunks = [];
  let count = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > maximum) throw new Error("Feedback response too large");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
}

function imageExtension(contentType) {
  if (/^image\/png(?:;|$)/i.test(contentType)) return "png";
  if (/^image\/jpeg(?:;|$)/i.test(contentType)) return "jpg";
  if (/^image\/heic(?:;|$)/i.test(contentType)) return "heic";
  if (/^image\/heif(?:;|$)/i.test(contentType)) return "heif";
  throw new Error("Unexpected feedback image type");
}

function feedbackRows(body) {
  if (
    !body ||
    !Array.isArray(body.data) ||
    body.data.length > MAX_ROWS ||
    (body.included !== undefined && !Array.isArray(body.included))
  )
    throw new Error("Unexpected feedback response");
  const builds = new Map();
  for (const item of body.included ?? []) {
    if (
      item?.type === "builds" &&
      /^[A-Za-z0-9-]{1,100}$/.test(item.id ?? "") &&
      /^\d{1,9}$/.test(item.attributes?.version ?? "")
    )
      builds.set(item.id, item.attributes.version);
  }
  return body.data.map((item) => {
    if (
      item?.type !== "betaFeedbackScreenshotSubmissions" ||
      !/^[A-Za-z0-9-]{1,100}$/.test(item.id ?? "") ||
      typeof item.attributes?.createdDate !== "string" ||
      !Number.isFinite(Date.parse(item.attributes.createdDate)) ||
      (item.attributes.comment !== null &&
        item.attributes.comment !== undefined &&
        (typeof item.attributes.comment !== "string" || item.attributes.comment.length > 10000)) ||
      !Array.isArray(item.attributes.screenshots) ||
      item.attributes.screenshots.length > 5
    )
      throw new Error("Unexpected feedback record");
    const buildId = item.relationships?.build?.data?.id;
    const build = builds.get(buildId) ?? null;
    const images = item.attributes.screenshots.map((s) => {
      if (!s || typeof s.url !== "string") throw new Error("Missing feedback image");
      return validImageUrl(s.url);
    });
    return {
      record: {
        id: item.id,
        created_at: item.attributes.createdDate,
        build,
        device_model:
          typeof item.attributes.deviceModel === "string"
            ? item.attributes.deviceModel.slice(0, 100)
            : null,
        os_version:
          typeof item.attributes.osVersion === "string"
            ? item.attributes.osVersion.slice(0, 40)
            : null,
        comment: item.attributes.comment ?? "",
        screenshots: [],
      },
      images,
    };
  });
}

export async function auditFeedback(
  env,
  outputFile,
  transport = globalThis.fetch,
  auth = tokenFor,
  publicKeyPem,
) {
  const token = auth(env);
  const seenPages = new Set();
  const seenRows = new Set();
  const rows = [];
  let next = initial;
  let pages = 0;
  while (next && pages < MAX_PAGES) {
    const target = validPageUrl(next.href);
    if (seenPages.has(target.href)) throw new Error("Repeated feedback page");
    seenPages.add(target.href);
    pages += 1;
    const response = await transport(target.href, {
      method: "GET",
      redirect: "error",
      signal: globalThis.AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (
      response.status !== 200 ||
      response.redirected ||
      (response.url && response.url !== target.href) ||
      !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")
    )
      throw new Error("Feedback read unavailable");
    const body = JSON.parse((await bytesOf(response, MAX_JSON_BYTES)).toString("utf8"));
    for (const row of feedbackRows(body)) {
      if (seenRows.has(row.record.id)) throw new Error("Repeated feedback record");
      seenRows.add(row.record.id);
      rows.push(row);
      if (rows.length > MAX_ROWS) throw new Error("Too many feedback records");
    }
    next = body.links?.next ? validPageUrl(body.links.next) : null;
  }
  if (next) throw new Error("Feedback pagination incomplete");
  let imageCount = 0;
  let imageBytes = 0;
  const images = [];
  for (const [recordIndex, row] of rows.entries()) {
    for (const [imageIndex, url] of row.images.entries()) {
      if (++imageCount > MAX_IMAGES) throw new Error("Too many feedback images");
      const response = await transport(url.href, {
        method: "GET",
        redirect: "error",
        signal: globalThis.AbortSignal.timeout(20000),
        headers: { Accept: "image/*" },
      });
      if (
        response.status !== 200 ||
        response.redirected ||
        (response.url && response.url !== url.href)
      )
        throw new Error("Feedback image read unavailable");
      const extension = imageExtension(response.headers.get("content-type") ?? "");
      const filename = `feedback-${String(recordIndex + 1).padStart(3, "0")}-${imageIndex + 1}.${extension}`;
      const bytes = await bytesOf(response, MAX_IMAGE_BYTES);
      imageBytes += bytes.byteLength;
      if (imageBytes > MAX_TOTAL_IMAGE_BYTES) throw new Error("Feedback images too large");
      images.push({ filename, base64: bytes.toString("base64") });
      row.record.screenshots.push(filename);
    }
  }
  const result = {
    schema_version: 1,
    app_id: APP_ID,
    checked_at: new Date().toISOString(),
    complete: true,
    pages,
    feedback_count: rows.length,
    image_count: imageCount,
    // Exclude tester identity, email, and expiring Apple image URLs.
    feedback: rows.map(({ record }) => record),
  };
  // No plaintext feedback is written to the public runner artifact path.
  await writeFile(outputFile, encryptFeedback({ result, images }, publicKeyPem), {
    flag: "wx",
    mode: 0o600,
  });
  return result;
}

export function encryptFeedback(payload, publicKeyPem) {
  const publicKey = createPublicKey(publicKeyPem ?? "");
  if (
    publicKey.asymmetricKeyType !== "rsa" ||
    (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 3072
  )
    throw new Error("Unexpected feedback encryption key");
  const key = randomBytes(32);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return (
    JSON.stringify({
      schema_version: 1,
      encryption: "RSA-OAEP-SHA256+A256GCM",
      wrapped_key: publicEncrypt({ key: publicKey, oaepHash: "sha256" }, key).toString("base64"),
      nonce: nonce.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    }) + "\n"
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error("Expected ciphertext file");
    const publicKey = await readFile(
      new URL("./keys/testflight-feedback-audit-20261103-public.pem", import.meta.url),
      "utf8",
    );
    const result = await auditFeedback(
      process.env,
      process.argv[2],
      globalThis.fetch,
      tokenFor,
      publicKey,
    );
    process.stdout.write(
      JSON.stringify({
        complete: result.complete,
        feedback_count: result.feedback_count,
        image_count: result.image_count,
      }) + "\n",
    );
  } catch {
    process.stderr.write("Read-only TestFlight feedback audit unavailable\n");
    process.exitCode = 2;
  }
}
