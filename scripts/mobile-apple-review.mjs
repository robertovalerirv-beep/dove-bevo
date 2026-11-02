// Audit by default. Physical-device provenance requires separately reviewed operator evidence.
import { createHash } from "node:crypto";
import { open, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { tokenFor } from "./mobile-store-status.mjs";

export const APP_ID = "6827324444";
export const VERSION_ID = "e01a5724-9314-4ed6-9353-abc5c4a21a07";
export const ORIGIN = "https://api.appstoreconnect.apple.com";
export const NOTES_URL = new URL("../mobile-apps/store-assets/app-review-notes-20261102.txt", import.meta.url);
export const NOTES_SHA = "541ed3fc478075ea0ed11f520d96046132f56392a9cae95d08595b77317ccfd6";
const LIMIT = 262144;
const states = new Set(["AWAITING_UPLOAD", "UPLOAD_COMPLETE", "COMPLETE", "FAILED"]);
const id = value => typeof value === "string" && /^[A-Za-z0-9-]{1,100}$/.test(value);
const fail = () => { throw new Error("Apple review audit failed validation"); };
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export function validateNotes(bytes) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (sha256(bytes) !== NOTES_SHA || text.length > 4000 || text.includes("\r") ||
      /TODO|TBD|PLACEHOLDER|\[insert|REPLACE_/i.test(text) ||
      ![1, 2, 3, 4, 5, 6].every(n => text.includes(`${n}. `))) fail();
  return { sha256: NOTES_SHA, characters: text.length };
}

async function request(path, token, transport, payload) {
  // All callers construct fixed paths or validated opaque resource IDs. Never follow API links.
  if (!path.startsWith("/v1/") || path.includes("..") || path.includes("#")) fail();
  const response = await transport(ORIGIN + path, {
    method: payload ? "PATCH" : "GET", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(payload ? { "Content-Type": "application/json" } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  if (!response.ok || response.redirected || response.status !== 200 ||
      !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) fail();
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > LIMIT)) fail();
  const reader = response.body?.getReader();
  if (!reader) fail();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMIT) { await reader.cancel(); fail(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!body || body.errors || body.links?.next) fail();
  return body;
}

function resource(value, type, expectedId) {
  if (!value || value.type !== type || !id(value.id) || (expectedId && value.id !== expectedId)) fail();
  return value;
}
function relationship(value, key, type, expectedId) {
  resource(value.relationships?.[key]?.data, type, expectedId);
}

export async function auditReview(env, { transport = globalThis.fetch, notes, apply = false } = {}) {
  if (apply) throw new Error("Use applyReview with separately reviewed physical evidence");
  return inspectReview(env, { transport, notes });
}

export function validateEvidence(evidence) {
  const keys = ["appId", "versionId", "notesSha256", "attachmentId", "fileName", "fileSize", "recordingSha256", "deviceModel", "osVersion", "appVersion", "buildNumber", "captureDate", "latestOSVerifiedOn", "ownerAttested", "reviewerViewed"];
  if (!evidence || Object.keys(evidence).sort().join() !== keys.sort().join() ||
      evidence.appId !== APP_ID || evidence.versionId !== VERSION_ID || evidence.notesSha256 !== NOTES_SHA ||
      !id(evidence.attachmentId) || !/^[A-Za-z0-9][A-Za-z0-9_. -]{0,150}\.(mp4|mov|m4v)$/i.test(evidence.fileName ?? "") ||
      !Number.isSafeInteger(evidence.fileSize) || evidence.fileSize <= 0 ||
      !/^[a-f0-9]{64}$/.test(evidence.recordingSha256 ?? "") || /^0+$/.test(evidence.recordingSha256) ||
      !/^iPhone [A-Za-z0-9 +()-]{1,60}$/.test(evidence.deviceModel ?? "") ||
      !/^\d{1,2}\.\d{1,2}(?:\.\d{1,2})?$/.test(evidence.osVersion ?? "") ||
      !/^\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/.test(evidence.appVersion ?? "") ||
      !/^\d{1,10}$/.test(evidence.buildNumber ?? "") ||
      evidence.ownerAttested !== true || evidence.reviewerViewed !== true) fail();
  const today = new Date().toISOString().slice(0, 10);
  for (const date of [evidence.captureDate, evidence.latestOSVerifiedOn]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date || date > today || date < "2026-11-02") fail();
  }
  if (evidence.latestOSVerifiedOn < evidence.captureDate) fail();
  return evidence;
}

async function inspectReview(env, { transport, notes, evidence } = {}) {
  const noteBytes = notes ?? await readFile(NOTES_URL);
  const proposedNotes = validateNotes(noteBytes);
  const base = { appId: APP_ID, versionId: VERSION_ID, proposedNotes,
    checkedAt: new Date().toISOString(), applyEnabled: Boolean(evidence),
    physicalDeviceEvidence: "NOT_ATTESTED", complete: false };
  try {
    const token = tokenFor(env);
    const version = resource((await request(`/v1/appStoreVersions/${VERSION_ID}?include=app,build&fields[appStoreVersions]=app,platform,appStoreState,versionString,build&fields[apps]=bundleId&fields[builds]=version`, token, transport)).data, "appStoreVersions", VERSION_ID);
    relationship(version, "app", "apps", APP_ID);
    if (version.attributes?.platform !== "IOS") fail();
    const detail = resource((await request(`/v1/appStoreVersions/${VERSION_ID}/appStoreReviewDetail?include=appStoreVersion&fields[appStoreReviewDetails]=appStoreVersion,demoAccountRequired&fields[appStoreVersions]=platform`, token, transport)).data, "appStoreReviewDetails");
    relationship(detail, "appStoreVersion", "appStoreVersions", VERSION_ID);
    if (typeof detail.attributes?.demoAccountRequired !== "boolean") fail();
    const attachments = await request(`/v1/appStoreReviewDetails/${detail.id}/appStoreReviewAttachments?limit=50&include=appStoreReviewDetail&fields[appStoreReviewAttachments]=assetDeliveryState,fileName,fileSize,appStoreReviewDetail&fields[appStoreReviewDetails]=demoAccountRequired`, token, transport);
    if (!Array.isArray(attachments.data) || attachments.data.length > 50 ||
        (attachments.meta?.paging?.total !== undefined && attachments.meta.paging.total !== attachments.data.length)) fail();
    const seen = new Set();
    const publicAttachments = attachments.data.map(item => {
      resource(item, "appStoreReviewAttachments");
      relationship(item, "appStoreReviewDetail", "appStoreReviewDetails", detail.id);
      if (seen.has(item.id)) fail();
      seen.add(item.id);
      const a = item.attributes;
      if (!a || !states.has(a.assetDeliveryState?.state) || typeof a.fileName !== "string" ||
          !Number.isSafeInteger(a.fileSize) || a.fileSize <= 0) fail();
      return { id: item.id, state: a.assetDeliveryState.state, fileSize: a.fileSize,
        videoFilenameCandidate: /\.(mov|mp4|m4v)$/i.test(a.fileName) };
    });
    const audited = { ...base, complete: true, reviewDetailId: detail.id,
      demoAccountRequired: detail.attributes.demoAccountRequired,
      attachments: publicAttachments };
    if (!evidence) return audited;
    const attached = attachments.data.find(item => item.id === evidence.attachmentId);
    if (!attached || attached.attributes.assetDeliveryState.state !== "COMPLETE" ||
        attached.attributes.fileName !== evidence.fileName || attached.attributes.fileSize !== evidence.fileSize ||
        version.attributes.versionString !== evidence.appVersion) fail();
    const buildId = version.relationships?.build?.data?.id;
    resource(version.relationships?.build?.data, "builds");
    const build = resource((await request(`/v1/builds/${buildId}?include=app&fields[builds]=version,app,processingState,expired&fields[apps]=bundleId`, token, transport)).data, "builds", buildId);
    relationship(build, "app", "apps", APP_ID);
    if (build.attributes?.version !== evidence.buildNumber || build.attributes.processingState !== "VALID" || build.attributes.expired !== false) fail();
    // No retries: a lost response after this point has an unknown outcome.
    const payload = { data: { type: "appStoreReviewDetails", id: detail.id,
      attributes: { notes: new TextDecoder().decode(noteBytes), demoAccountRequired: false } } };
    let updated;
    try { updated = resource((await request(`/v1/appStoreReviewDetails/${detail.id}`, token, transport, payload)).data, "appStoreReviewDetails", detail.id); }
    catch { return { ...base, error: "APPLY_OUTCOME_UNKNOWN_DO_NOT_RETRY_WITHOUT_READBACK" }; }
    if (updated.attributes?.notes !== payload.data.attributes.notes || updated.attributes.demoAccountRequired !== false) {
      return { ...base, error: "APPLY_OUTCOME_UNKNOWN_DO_NOT_RETRY_WITHOUT_READBACK" };
    }
    return { ...audited, physicalDeviceEvidence: "MANUALLY_ATTESTED_NOT_CRYPTOGRAPHIC_PROOF",
      applied: true, demoAccountRequired: false, evidenceSha256: sha256(JSON.stringify(evidence)),
      attachmentId: evidence.attachmentId, recordingSha256: evidence.recordingSha256 };
  } catch {
    // Never serialize provider error bodies, notes, contacts, filenames, upload URLs or tokens.
    return { ...base, error: "APPLE_REVIEW_AUDIT_UNAVAILABLE_OR_INVALID" };
  }
}

export async function applyReview(env, { evidence, expectedNotesSha, notes, transport = globalThis.fetch } = {}) {
  // All local guards precede credentials, network and PATCH. No evidence file ships with this revision.
  if (expectedNotesSha !== NOTES_SHA) fail();
  validateEvidence(evidence);
  return inspectReview(env, { transport, notes, evidence });
}

async function main(args) {
  if (!args[0] || args[0].startsWith("-")) fail();
  // Reserve the receipt before any possible PATCH; do not overwrite a prior attempt.
  const output = await open(args[0], "wx", 0o600);
  try {
  let receipt;
  if (args.length === 6 && args[1] === "--apply" && args[2] === "--evidence" && args[4] === "--notes-sha") {
    const bytes = await readFile(args[3]);
    if (bytes.byteLength > 8192) fail();
    receipt = await applyReview(process.env, { evidence: JSON.parse(bytes.toString("utf8")), expectedNotesSha: args[5] });
  } else {
    if (args.length !== 1 || args[0].startsWith("-")) throw new Error("Usage: OUTPUT.json [--apply --evidence FILE --notes-sha SHA]");
    receipt = await auditReview(process.env);
  }
  await output.writeFile(JSON.stringify(receipt, null, 2) + "\n");
  await output.sync();
  if (!receipt.complete) process.exitCode = 1;
  } finally { await output.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(() => { console.error("Apple review preparation blocked or audit failed; no metadata was changed"); process.exitCode = 1; });
}
