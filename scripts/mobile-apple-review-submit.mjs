// App Review delivery is deliberately separate from the read-only Apple audit.
// A real iPhone recording and operator attestation are required before --upload/--submit.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import {
  APP_ID,
  VERSION_ID,
  NOTES_SHA,
  applyReview,
  validateEvidence,
} from "./mobile-apple-review.mjs";
import { tokenFor } from "./mobile-store-status.mjs";

const API = "https://api.appstoreconnect.apple.com";
const BUILD = "604";
const VERSION = "1.0.0";
const MAX_JSON = 262144;
const MAX_VIDEO = 2 * 1024 * 1024 * 1024;
const VALID_STATES = new Set([
  "READY_FOR_REVIEW",
  "WAITING_FOR_REVIEW",
  "IN_REVIEW",
  "UNRESOLVED_ISSUES",
  "CANCELING",
  "COMPLETING",
  "COMPLETE",
]);
const opaqueId = (value) => typeof value === "string" && /^[A-Za-z0-9-]{1,100}$/.test(value);
const failure = (code) => {
  throw new Error(code);
};

function resource(value, type, expected) {
  if (!value || value.type !== type || !opaqueId(value.id) || (expected && value.id !== expected))
    failure("APPLE_RESOURCE_MISMATCH");
  return value;
}
function relation(value, key, type, expected) {
  return resource(value?.relationships?.[key]?.data, type, expected);
}

async function jsonResponse(response, expectedStatus) {
  if (response.status === 409) failure("APPLE_API_CONFLICT_READ_BACK_BEFORE_RETRY");
  if (
    response.redirected ||
    response.status !== expectedStatus ||
    !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")
  )
    failure("APPLE_API_RESPONSE_INVALID");
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_JSON))
    failure("APPLE_API_RESPONSE_INVALID");
  const reader = response.body?.getReader();
  if (!reader) failure("APPLE_API_RESPONSE_INVALID");
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON) failure("APPLE_API_RESPONSE_INVALID");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    failure("APPLE_API_RESPONSE_INVALID");
  }
  if (!body || body.errors || body.links?.next) failure("APPLE_API_RESPONSE_INVALID");
  return body;
}

function apiClient(env, transport) {
  return async (method, path, payload) => {
    if (!/^\/v1\/[A-Za-z0-9/?=&%,.\[\]-]+$/.test(path) || path.includes(".."))
      failure("APPLE_API_PATH_INVALID");
    const response = await transport(API + path, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${tokenFor(env)}`,
        Accept: "application/json",
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    return jsonResponse(response, method === "POST" ? 201 : 200);
  };
}

export async function inspectVideo(videoPath) {
  if (typeof videoPath !== "string" || !isAbsolute(videoPath))
    failure("RECORDING_PATH_MUST_BE_ABSOLUTE");
  const fileName = basename(videoPath);
  if (!/^[A-Za-z0-9][A-Za-z0-9_. -]{0,150}\.mp4$/i.test(fileName))
    failure("RECORDING_FILENAME_INVALID");
  const file = await stat(videoPath);
  if (!file.isFile() || !Number.isSafeInteger(file.size) || file.size < 16 || file.size > MAX_VIDEO)
    failure("RECORDING_SIZE_INVALID");
  const handle = await open(videoPath, "r");
  try {
    const header = Buffer.alloc(12);
    if (
      (await handle.read(header, 0, 12, 0)).bytesRead !== 12 ||
      header.toString("ascii", 4, 8) !== "ftyp"
    )
      failure("RECORDING_NOT_MP4");
  } finally {
    await handle.close();
  }
  const sha = createHash("sha256");
  const md5 = createHash("md5");
  for await (const chunk of createReadStream(videoPath)) {
    sha.update(chunk);
    md5.update(chunk);
  }
  const after = await stat(videoPath);
  if (after.size !== file.size || after.mtimeMs !== file.mtimeMs)
    failure("RECORDING_CHANGED_DURING_READ");
  return { fileName, fileSize: file.size, sha256: sha.digest("hex"), md5: md5.digest("hex") };
}

export function evidenceFor(recording, operator, attachmentId = "pending") {
  if (
    !operator ||
    Object.keys(operator).sort().join() !==
      [
        "appVersion",
        "buildNumber",
        "captureDate",
        "deviceModel",
        "latestOSVerifiedOn",
        "osVersion",
        "ownerAttested",
        "reviewerViewed",
      ]
        .sort()
        .join()
  )
    failure("RECORDING_EVIDENCE_INVALID");
  const evidence = {
    appId: APP_ID,
    versionId: VERSION_ID,
    notesSha256: NOTES_SHA,
    attachmentId,
    fileName: recording.fileName,
    fileSize: recording.fileSize,
    recordingSha256: recording.sha256,
    ...operator,
  };
  validateEvidence(evidence);
  if (operator.appVersion !== VERSION || operator.buildNumber !== BUILD)
    failure("RECORDING_BUILD_MISMATCH");
  return evidence;
}

export function validateUploadOperations(operations, fileSize) {
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > 1000)
    failure("APPLE_UPLOAD_PLAN_INVALID");
  const sorted = operations
    .map((op) => {
      if (
        !Number.isSafeInteger(op.offset) ||
        !Number.isSafeInteger(op.length) ||
        op.offset < 0 ||
        op.length < 1 ||
        op.method !== "PUT" ||
        typeof op.url !== "string" ||
        !Array.isArray(op.requestHeaders)
      )
        failure("APPLE_UPLOAD_PLAN_INVALID");
      let url;
      try {
        url = new URL(op.url);
      } catch {
        failure("APPLE_UPLOAD_PLAN_INVALID");
      }
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.hash ||
        !/^(?:[a-z0-9-]+\.)+blobstore\.apple\.com$/.test(url.hostname)
      )
        failure("APPLE_UPLOAD_PLAN_INVALID");
      const headers = {};
      for (const item of op.requestHeaders) {
        if (
          !item ||
          !/^[A-Za-z0-9-]{1,60}$/.test(item.name ?? "") ||
          typeof item.value !== "string" ||
          /[\r\n]/.test(item.value) ||
          /^(?:authorization|cookie|host)$/i.test(item.name) ||
          Object.keys(headers).some((name) => name.toLowerCase() === item.name.toLowerCase())
        )
          failure("APPLE_UPLOAD_PLAN_INVALID");
        headers[item.name] = item.value;
      }
      return { offset: op.offset, length: op.length, url: op.url, headers };
    })
    .sort((a, b) => a.offset - b.offset);
  let covered = 0;
  for (const op of sorted) {
    if (op.offset !== covered || op.offset + op.length > fileSize)
      failure("APPLE_UPLOAD_PLAN_INVALID");
    covered += op.length;
  }
  if (covered !== fileSize) failure("APPLE_UPLOAD_PLAN_INVALID");
  return sorted;
}

async function readStore(api) {
  const version = resource(
    (
      await api(
        "GET",
        `/v1/appStoreVersions/${VERSION_ID}?include=app,build&fields[appStoreVersions]=app,build,platform,versionString,appStoreState`,
      )
    ).data,
    "appStoreVersions",
    VERSION_ID,
  );
  relation(version, "app", "apps", APP_ID);
  if (
    version.attributes?.platform !== "IOS" ||
    version.attributes?.versionString !== VERSION ||
    version.attributes?.appStoreState !== "PREPARE_FOR_SUBMISSION"
  )
    failure("APPLE_VERSION_NOT_READY");
  const buildId = relation(version, "build", "builds").id;
  const build = resource(
    (
      await api(
        "GET",
        `/v1/builds/${buildId}?include=app&fields[builds]=app,version,processingState,expired`,
      )
    ).data,
    "builds",
    buildId,
  );
  relation(build, "app", "apps", APP_ID);
  if (
    build.attributes?.version !== BUILD ||
    build.attributes?.processingState !== "VALID" ||
    build.attributes?.expired !== false
  )
    failure("APPLE_BUILD_NOT_READY");
  const detail = resource(
    (
      await api(
        "GET",
        `/v1/appStoreVersions/${VERSION_ID}/appStoreReviewDetail?include=appStoreVersion&fields[appStoreReviewDetails]=appStoreVersion,demoAccountRequired,notes`,
      )
    ).data,
    "appStoreReviewDetails",
  );
  relation(detail, "appStoreVersion", "appStoreVersions", VERSION_ID);
  const attachmentPage = await api(
    "GET",
    `/v1/appStoreReviewDetails/${detail.id}/appStoreReviewAttachments?limit=50&include=appStoreReviewDetail&fields[appStoreReviewAttachments]=fileName,fileSize,sourceFileChecksum,assetDeliveryState,appStoreReviewDetail`,
  );
  const attachments = attachmentPage.data;
  if (
    !Array.isArray(attachments) ||
    attachments.length > 50 ||
    (attachmentPage.meta?.paging?.total !== undefined &&
      attachmentPage.meta.paging.total !== attachments.length)
  )
    failure("APPLE_ATTACHMENTS_AMBIGUOUS");
  for (const attachment of attachments) {
    resource(attachment, "appStoreReviewAttachments");
    relation(attachment, "appStoreReviewDetail", "appStoreReviewDetails", detail.id);
  }
  return { detail, attachments };
}

function matchingAttachment(store, recording) {
  const candidates = store.attachments.filter(
    (item) =>
      item.attributes?.fileName === recording.fileName &&
      item.attributes?.fileSize === recording.fileSize,
  );
  if (candidates.length > 1) failure("APPLE_ATTACHMENT_AMBIGUOUS");
  if (!candidates.length) return null;
  const item = candidates[0];
  const state = item.attributes?.assetDeliveryState?.state;
  if (
    typeof state !== "string" ||
    (item.attributes?.sourceFileChecksum &&
      item.attributes.sourceFileChecksum.toLowerCase() !== recording.md5)
  )
    failure("APPLE_ATTACHMENT_EXISTS_INCOMPLETE_OR_DIFFERENT");
  return item;
}

async function uploadPart(op, videoPath, transport) {
  const response = await transport(op.url, {
    method: "PUT",
    redirect: "error",
    signal: AbortSignal.timeout(600000),
    headers: op.headers,
    body: createReadStream(videoPath, { start: op.offset, end: op.offset + op.length - 1 }),
    duplex: "half",
  });
  if (response.redirected || ![200, 201, 204].includes(response.status))
    failure("APPLE_UPLOAD_OUTCOME_UNKNOWN_READ_BACK_BEFORE_RETRY");
}

async function uploadRecording(api, transport, store, recording, videoPath) {
  const existing = matchingAttachment(store, recording);
  if (existing) {
    if (
      existing.attributes.assetDeliveryState.state !== "COMPLETE" ||
      existing.attributes.sourceFileChecksum?.toLowerCase() !== recording.md5
    )
      failure("APPLE_ATTACHMENT_EXISTS_INCOMPLETE_OR_DIFFERENT");
    return { attachmentId: existing.id, state: "COMPLETE", reused: true };
  }
  const created = resource(
    (
      await api("POST", "/v1/appStoreReviewAttachments", {
        data: {
          type: "appStoreReviewAttachments",
          attributes: { fileName: recording.fileName, fileSize: recording.fileSize },
          relationships: {
            appStoreReviewDetail: { data: { type: "appStoreReviewDetails", id: store.detail.id } },
          },
        },
      })
    ).data,
    "appStoreReviewAttachments",
  );
  // Reservation responses may expose only relationship links; the reservation request
  // already scoped this ID to the verified review detail. Re-read the attachment below.
  if (
    created.attributes?.fileName !== recording.fileName ||
    created.attributes?.fileSize !== recording.fileSize ||
    created.attributes?.assetDeliveryState?.state !== "AWAITING_UPLOAD"
  )
    failure("APPLE_RESERVATION_UNCERTAIN_READ_BACK_BEFORE_RETRY");
  const operations = validateUploadOperations(
    created.attributes.uploadOperations,
    recording.fileSize,
  );
  for (const op of operations) await uploadPart(op, videoPath, transport);
  const after = await inspectVideo(videoPath);
  if (after.sha256 !== recording.sha256 || after.md5 !== recording.md5)
    failure("RECORDING_CHANGED_DURING_UPLOAD");
  const committed = resource(
    (
      await api("PATCH", `/v1/appStoreReviewAttachments/${created.id}`, {
        data: {
          type: "appStoreReviewAttachments",
          id: created.id,
          attributes: { uploaded: true, sourceFileChecksum: recording.md5 },
        },
      })
    ).data,
    "appStoreReviewAttachments",
    created.id,
  );
  if (!["UPLOAD_COMPLETE", "COMPLETE"].includes(committed.attributes?.assetDeliveryState?.state))
    failure("APPLE_COMMIT_UNCERTAIN_READ_BACK_BEFORE_RETRY");
  let state = committed.attributes.assetDeliveryState.state;
  for (let attempt = 0; attempt < 10 && state === "UPLOAD_COMPLETE"; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const check = resource(
      (
        await api(
          "GET",
          `/v1/appStoreReviewAttachments/${created.id}?include=appStoreReviewDetail&fields[appStoreReviewAttachments]=fileName,fileSize,sourceFileChecksum,assetDeliveryState,appStoreReviewDetail`,
        )
      ).data,
      "appStoreReviewAttachments",
      created.id,
    );
    relation(check, "appStoreReviewDetail", "appStoreReviewDetails", store.detail.id);
    if (
      check.attributes?.fileName !== recording.fileName ||
      check.attributes?.fileSize !== recording.fileSize ||
      check.attributes?.sourceFileChecksum?.toLowerCase() !== recording.md5
    )
      failure("APPLE_ATTACHMENT_READBACK_MISMATCH");
    state = check.attributes?.assetDeliveryState?.state;
    if (!["UPLOAD_COMPLETE", "COMPLETE"].includes(state))
      failure("APPLE_ATTACHMENT_PROCESSING_FAILED");
  }
  return { attachmentId: created.id, state, reused: false };
}

async function findSubmission(api) {
  const page = await api(
    "GET",
    `/v1/apps/${APP_ID}/reviewSubmissions?filter[platform]=IOS&include=appStoreVersionForReview&limit=200`,
  );
  const data = page.data;
  if (
    !Array.isArray(data) ||
    data.length > 200 ||
    (page.meta?.paging?.total !== undefined && page.meta.paging.total !== data.length)
  )
    failure("APPLE_SUBMISSIONS_AMBIGUOUS");
  const candidates = [];
  for (const item of data) {
    resource(item, "reviewSubmissions");
    if (!VALID_STATES.has(item.attributes?.state)) failure("APPLE_SUBMISSIONS_AMBIGUOUS");
    if (item.attributes.state === "COMPLETE") continue;
    const version = item.relationships?.appStoreVersionForReview?.data;
    if (version) resource(version, "appStoreVersions");
    const items = await submissionItems(api, item.id);
    const versionItems = items.filter((entry) => entry.relationships?.appStoreVersion?.data);
    for (const entry of versionItems)
      resource(entry.relationships.appStoreVersion.data, "appStoreVersions");
    if (
      items.some(
        (entry) =>
          entry.relationships?.appStoreVersion && !entry.relationships.appStoreVersion.data,
      )
    )
      failure("APPLE_SUBMISSION_ITEMS_AMBIGUOUS");
    const matches =
      version?.id === VERSION_ID ||
      versionItems.some((entry) => entry.relationships.appStoreVersion.data.id === VERSION_ID);
    if (version && version.id !== VERSION_ID && matches) failure("APPLE_SUBMISSIONS_AMBIGUOUS");
    if (matches || (item.attributes.state === "READY_FOR_REVIEW" && items.length === 0))
      candidates.push({
        ...item,
        versionItems: versionItems.filter(
          (entry) => entry.relationships.appStoreVersion.data.id === VERSION_ID,
        ),
        items,
      });
    else if (item.attributes.state !== "UNRESOLVED_ISSUES")
      failure("APPLE_OTHER_ACTIVE_SUBMISSION_REQUIRES_MANUAL_REVIEW");
  }
  if (candidates.length > 1) failure("APPLE_SUBMISSIONS_AMBIGUOUS");
  return candidates[0] ?? null;
}

async function submissionItems(api, submissionId) {
  const page = await api(
    "GET",
    `/v1/reviewSubmissions/${submissionId}/items?limit=50&include=appStoreVersion`,
  );
  const data = page.data;
  if (
    !Array.isArray(data) ||
    data.length > 50 ||
    (page.meta?.paging?.total !== undefined && page.meta.paging.total !== data.length)
  )
    failure("APPLE_SUBMISSION_ITEMS_AMBIGUOUS");
  for (const item of data) resource(item, "reviewSubmissionItems");
  return data;
}

async function submitReview(api) {
  let submission = await findSubmission(api);
  if (submission && ["WAITING_FOR_REVIEW", "IN_REVIEW"].includes(submission.attributes.state))
    return {
      submissionId: submission.id,
      state: submission.attributes.state,
      alreadySubmitted: true,
    };
  if (submission && submission.attributes.state !== "READY_FOR_REVIEW")
    failure("APPLE_SUBMISSION_STATE_NOT_READY");
  if (!submission) {
    submission = resource(
      (
        await api("POST", "/v1/reviewSubmissions", {
          data: {
            type: "reviewSubmissions",
            relationships: { app: { data: { type: "apps", id: APP_ID } } },
          },
        })
      ).data,
      "reviewSubmissions",
    );
    if (submission.attributes?.state !== "READY_FOR_REVIEW")
      failure("APPLE_SUBMISSION_CREATE_UNCERTAIN_READ_BACK_BEFORE_RETRY");
  }
  let items = await submissionItems(api, submission.id);
  if (items.length === 0) {
    resource(
      (
        await api("POST", "/v1/reviewSubmissionItems", {
          data: {
            type: "reviewSubmissionItems",
            relationships: {
              reviewSubmission: { data: { type: "reviewSubmissions", id: submission.id } },
              appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } },
            },
          },
        })
      ).data,
      "reviewSubmissionItems",
    );
    items = await submissionItems(api, submission.id);
  }
  if (
    items.length !== 1 ||
    !items[0].relationships?.appStoreVersion?.data ||
    items[0].relationships.appStoreVersion.data.id !== VERSION_ID
  )
    failure("APPLE_SUBMISSION_ITEMS_AMBIGUOUS");
  const updated = resource(
    (
      await api("PATCH", `/v1/reviewSubmissions/${submission.id}`, {
        data: { type: "reviewSubmissions", id: submission.id, attributes: { submitted: true } },
      })
    ).data,
    "reviewSubmissions",
    submission.id,
  );
  const readback = resource(
    (await api("GET", `/v1/reviewSubmissions/${submission.id}`)).data,
    "reviewSubmissions",
    submission.id,
  );
  const state = readback.attributes?.state;
  if (!["WAITING_FOR_REVIEW", "IN_REVIEW"].includes(state))
    failure("APPLE_SUBMISSION_OUTCOME_UNCONFIRMED_READ_BACK_BEFORE_RETRY");
  return { submissionId: submission.id, state, alreadySubmitted: false };
}

export async function runAppleReview(
  env,
  { videoPath, operatorEvidence, attachmentId, mode = "audit", transport = globalThis.fetch } = {},
) {
  if (!["audit", "upload", "submit"].includes(mode) || !videoPath)
    failure("APPLE_REVIEW_ARGUMENTS_INVALID");
  const recording = await inspectVideo(videoPath);
  evidenceFor(recording, operatorEvidence, attachmentId ?? "pending");
  if (mode === "submit" && !opaqueId(attachmentId)) failure("APPLE_ATTACHMENT_ID_REQUIRED");
  const api = apiClient(env, transport);
  const store = await readStore(api);
  const existing = matchingAttachment(store, recording);
  if (mode === "audit") {
    const submission = await findSubmission(api);
    return {
      mode,
      appId: APP_ID,
      versionId: VERSION_ID,
      build: BUILD,
      recordingSha256: recording.sha256,
      fileSize: recording.fileSize,
      attachmentId: existing?.id ?? null,
      attachmentState: existing?.attributes.assetDeliveryState.state ?? null,
      submissionId: submission?.id ?? null,
      submissionState: submission?.attributes.state ?? null,
      changed: false,
    };
  }
  if (mode === "upload") {
    const result = await uploadRecording(api, transport, store, recording, videoPath);
    return { mode, ...result, recordingSha256: recording.sha256, changed: !result.reused };
  }
  if (
    !existing ||
    existing.id !== attachmentId ||
    existing.attributes.assetDeliveryState.state !== "COMPLETE" ||
    existing.attributes.sourceFileChecksum?.toLowerCase() !== recording.md5
  )
    failure("APPLE_ATTACHMENT_NOT_COMPLETE_OR_MISMATCH");
  const currentSubmission = await findSubmission(api);
  if (currentSubmission && currentSubmission.attributes.state !== "READY_FOR_REVIEW")
    failure("APPLE_SUBMISSION_STATE_NOT_READY");
  const evidence = evidenceFor(recording, operatorEvidence, attachmentId);
  const notes = await applyReview(env, {
    evidence,
    expectedNotesSha: NOTES_SHA,
    transport,
  });
  if (!notes.complete || !notes.applied)
    failure("APPLE_REVIEW_NOTES_UNCONFIRMED_READ_BACK_BEFORE_RETRY");
  const submission = await submitReview(api);
  return {
    mode,
    attachmentId,
    recordingSha256: recording.sha256,
    notesApplied: true,
    ...submission,
    changed: !submission.alreadySubmitted,
  };
}

async function main(args) {
  const usage =
    "Usage: OUTPUT.json --video FILE --evidence FILE [--attachment-id ID] [--upload|--submit]";
  if (args.length < 5 || args[1] !== "--video" || args[3] !== "--evidence") failure(usage);
  if (![args[0], args[2], args[4]].every((item) => isAbsolute(item))) failure(usage);
  let mode = "audit";
  let attachmentId;
  const rest = args.slice(5);
  while (rest.length) {
    const key = rest.shift();
    if (key === "--attachment-id" && !attachmentId) attachmentId = rest.shift();
    else if (key === "--upload" && mode === "audit") mode = "upload";
    else if (key === "--submit" && mode === "audit") mode = "submit";
    else failure(usage);
  }
  const bytes = await readFile(args[4]);
  if (bytes.length > 8192) failure("RECORDING_EVIDENCE_INVALID");
  const result = await runAppleReview(process.env, {
    videoPath: args[2],
    operatorEvidence: JSON.parse(bytes.toString("utf8")),
    attachmentId,
    mode,
  });
  const output = await open(args[0], "wx", 0o600);
  try {
    await output.writeFile(JSON.stringify(result, null, 2) + "\n");
    await output.sync();
  } finally {
    await output.close();
  }
  console.log(mode === "audit" ? "Apple review audit complete" : "Apple review action read back");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(
      /^APPLE_|^RECORDING_/.test(error?.message ?? "")
        ? error.message
        : "APPLE_REVIEW_ACTION_OUTCOME_UNKNOWN_READ_BACK_BEFORE_RETRY",
    );
    process.exitCode = 1;
  });
}
