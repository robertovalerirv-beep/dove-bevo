import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { APP_ID, VERSION_ID } from "../mobile-apple-review.mjs";
import {
  inspectVideo,
  runAppleReview,
  validateUploadOperations,
} from "../mobile-apple-review-submit.mjs";

const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const env = {
  DOVEBEVO_ASC_KEY_ID: "ABCDEFGHIJ",
  DOVEBEVO_ASC_ISSUER_ID: "00000000-0000-4000-8000-000000000000",
  DOVEBEVO_ASC_PRIVATE_KEY: pair.privateKey.export({ type: "pkcs8", format: "pem" }),
};
const link = (type, id) => ({ data: { type, id } });
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const demo = Buffer.alloc(32);
demo.write("ftyp", 4, "ascii");
const operatorEvidence = {
  deviceModel: "iPhone 16 Plus",
  osVersion: "27.0.1",
  appVersion: "1.0.0",
  buildNumber: "604",
  captureDate: "2026-11-20",
  latestOSVerifiedOn: "2026-11-20",
  ownerAttested: true,
  reviewerViewed: true,
};

async function fixture(run) {
  const dir = await mkdtemp(join(process.cwd(), ".test-review-"));
  const videoPath = join(dir, "review-demo.mp4");
  try {
    await writeFile(videoPath, demo);
    return await run(videoPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function mockApple(
  recording,
  {
    initialAttachment = null,
    failPart = -1,
    initialSubmission = null,
    conflictReservation = false,
  } = {},
) {
  const state = {
    attachment: initialAttachment,
    submission: initialSubmission,
    items: [],
    calls: [],
    chunks: [],
  };
  const attachment = () => ({
    data: [state.attachment].filter(Boolean),
    meta: { paging: { total: state.attachment ? 1 : 0 } },
  });
  const detail = () => ({
    data: {
      type: "appStoreReviewDetails",
      id: "detail-604",
      attributes: { demoAccountRequired: false, notes: state.notes ?? "existing" },
      relationships: { appStoreVersion: link("appStoreVersions", VERSION_ID) },
    },
  });
  const operations = [0, demo.length / 2].map((offset) => ({
    offset,
    length: demo.length / 2,
    method: "PUT",
    url: `https://store-030.blobstore.apple.com/upload/${offset}?Signature=redacted`,
    requestHeaders: [{ name: "Content-Type", value: "video/mp4" }],
  }));
  const transport = async (input, options = {}) => {
    const url = new URL(input);
    state.calls.push({ method: options.method, path: url.pathname });
    if (url.hostname.endsWith(".blobstore.apple.com")) {
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.redirect, "error");
      const offset = Number(url.pathname.split("/").at(-1));
      const buffers = [];
      for await (const part of options.body) buffers.push(part);
      state.chunks.push({ offset, bytes: Buffer.concat(buffers) });
      if (offset === failPart) return new Response("upload failed", { status: 500 });
      return new Response(null, { status: 200 });
    }
    if (options.method === "GET" && url.pathname === `/v1/appStoreVersions/${VERSION_ID}`)
      return json({
        data: {
          type: "appStoreVersions",
          id: VERSION_ID,
          attributes: {
            platform: "IOS",
            versionString: "1.0.0",
            appStoreState: "PREPARE_FOR_SUBMISSION",
          },
          relationships: { app: link("apps", APP_ID), build: link("builds", "build-604") },
        },
      });
    if (options.method === "GET" && url.pathname === "/v1/builds/build-604")
      return json({
        data: {
          type: "builds",
          id: "build-604",
          attributes: { version: "604", processingState: "VALID", expired: false },
          relationships: { app: link("apps", APP_ID) },
        },
      });
    if (
      options.method === "GET" &&
      url.pathname === `/v1/appStoreVersions/${VERSION_ID}/appStoreReviewDetail`
    )
      return json(detail());
    if (
      options.method === "GET" &&
      url.pathname === "/v1/appStoreReviewDetails/detail-604/appStoreReviewAttachments"
    )
      return json(attachment());
    if (options.method === "POST" && url.pathname === "/v1/appStoreReviewAttachments") {
      if (conflictReservation) return json({ errors: [{ detail: "private provider text" }] }, 409);
      state.attachment = {
        type: "appStoreReviewAttachments",
        id: "attach-604",
        attributes: {
          fileName: recording.fileName,
          fileSize: recording.fileSize,
          sourceFileChecksum: null,
          assetDeliveryState: { state: "AWAITING_UPLOAD" },
          uploadOperations: operations,
        },
        relationships: { appStoreReviewDetail: link("appStoreReviewDetails", "detail-604") },
      };
      return json({ data: state.attachment }, 201);
    }
    if (options.method === "PATCH" && url.pathname === "/v1/appStoreReviewAttachments/attach-604") {
      const payload = JSON.parse(options.body);
      assert.equal(payload.data.attributes.sourceFileChecksum, recording.md5);
      state.attachment.attributes.sourceFileChecksum = recording.md5;
      state.attachment.attributes.assetDeliveryState.state = "UPLOAD_COMPLETE";
      return json({ data: state.attachment });
    }
    if (options.method === "GET" && url.pathname === "/v1/appStoreReviewAttachments/attach-604") {
      state.attachment.attributes.assetDeliveryState.state = "COMPLETE";
      return json({ data: state.attachment });
    }
    if (options.method === "PATCH" && url.pathname === "/v1/appStoreReviewDetails/detail-604") {
      state.notes = JSON.parse(options.body).data.attributes.notes;
      return json(detail());
    }
    if (options.method === "GET" && url.pathname === `/v1/apps/${APP_ID}/reviewSubmissions`)
      return json({
        data: [state.submission].filter(Boolean),
        meta: { paging: { total: state.submission ? 1 : 0 } },
      });
    if (options.method === "POST" && url.pathname === "/v1/reviewSubmissions") {
      state.submission = {
        type: "reviewSubmissions",
        id: "submission-604",
        attributes: { state: "READY_FOR_REVIEW" },
      };
      return json({ data: state.submission }, 201);
    }
    if (options.method === "GET" && url.pathname === "/v1/reviewSubmissions/submission-604/items")
      return json({ data: state.items, meta: { paging: { total: state.items.length } } });
    if (options.method === "POST" && url.pathname === "/v1/reviewSubmissionItems") {
      state.items = [
        {
          type: "reviewSubmissionItems",
          id: "item-604",
          relationships: {
            reviewSubmission: link("reviewSubmissions", "submission-604"),
            appStoreVersion: link("appStoreVersions", VERSION_ID),
          },
        },
      ];
      return json({ data: state.items[0] }, 201);
    }
    if (options.method === "PATCH" && url.pathname === "/v1/reviewSubmissions/submission-604") {
      state.submission.attributes.state = "WAITING_FOR_REVIEW";
      return json({ data: state.submission });
    }
    if (options.method === "GET" && url.pathname === "/v1/reviewSubmissions/submission-604")
      return json({ data: state.submission });
    assert.fail(`Unexpected mocked Apple request ${options.method} ${url.pathname}`);
  };
  return { state, transport };
}

test("upload operations require secure, complete and nonoverlapping byte ranges", () => {
  const good = [0, 5].map((offset) => ({
    offset,
    length: 5,
    method: "PUT",
    url: "https://store-030.blobstore.apple.com/upload",
    requestHeaders: [{ name: "Content-Type", value: "video/mp4" }],
  }));
  assert.equal(validateUploadOperations(good, 10).length, 2);
  assert.throws(() =>
    validateUploadOperations([{ ...good[0], url: "https://evil.example/" }, good[1]], 10),
  );
  assert.throws(() => validateUploadOperations([{ ...good[0], length: 6 }, good[1]], 10));
  assert.throws(() => validateUploadOperations([good[0]], 10));
});

test("audit is read only and reports an unfinished attachment", async () =>
  fixture(async (videoPath) => {
    const recording = await inspectVideo(videoPath);
    const { state, transport } = mockApple(recording, {
      initialAttachment: {
        type: "appStoreReviewAttachments",
        id: "attach-604",
        attributes: {
          fileName: recording.fileName,
          fileSize: recording.fileSize,
          assetDeliveryState: { state: "UPLOAD_COMPLETE" },
          sourceFileChecksum: recording.md5,
        },
        relationships: { appStoreReviewDetail: link("appStoreReviewDetails", "detail-604") },
      },
    });
    const result = await runAppleReview(env, { videoPath, operatorEvidence, transport });
    assert.equal(result.attachmentState, "UPLOAD_COMPLETE");
    assert.equal(result.changed, false);
    assert(state.calls.every(({ method }) => method === "GET"));
  }));

test("two chunks commit the original checksum, and rerunning does not reserve twice", async () =>
  fixture(async (videoPath) => {
    const recording = await inspectVideo(videoPath);
    const { state, transport } = mockApple(recording);
    const first = await runAppleReview(env, {
      videoPath,
      operatorEvidence,
      mode: "upload",
      transport,
    });
    assert.equal(first.state, "COMPLETE");
    assert.equal(first.reused, false);
    assert.deepEqual(
      state.chunks.map((part) => part.offset),
      [0, demo.length / 2],
    );
    assert.equal(
      Buffer.concat(state.chunks.map((part) => part.bytes)).toString("hex"),
      demo.toString("hex"),
    );
    const second = await runAppleReview(env, {
      videoPath,
      operatorEvidence,
      mode: "upload",
      transport,
    });
    assert.equal(second.reused, true);
    assert.equal(state.calls.filter((call) => call.method === "POST").length, 1);
  }));

test("failed chunk never commits, changes notes, or submits", async () =>
  fixture(async (videoPath) => {
    const recording = await inspectVideo(videoPath);
    const { state, transport } = mockApple(recording, { failPart: demo.length / 2 });
    await assert.rejects(
      runAppleReview(env, { videoPath, operatorEvidence, mode: "upload", transport }),
      /APPLE_UPLOAD_OUTCOME_UNKNOWN_READ_BACK_BEFORE_RETRY/,
    );
    assert(!state.calls.some((call) => call.method === "PATCH"));
    assert(!state.calls.some((call) => call.path.includes("reviewSubmissions")));
  }));

test("reservation conflict is not retried or mistaken for an existing upload", async () =>
  fixture(async (videoPath) => {
    const recording = await inspectVideo(videoPath);
    const { state, transport } = mockApple(recording, { conflictReservation: true });
    await assert.rejects(
      runAppleReview(env, { videoPath, operatorEvidence, mode: "upload", transport }),
      /APPLE_API_CONFLICT_READ_BACK_BEFORE_RETRY/,
    );
    assert.equal(state.calls.filter((call) => call.method === "POST").length, 1);
    assert(!state.calls.some((call) => call.method === "PATCH"));
  }));

test("submit requires the exact completed attachment before any Apple write", async () =>
  fixture(async (videoPath) => {
    const recording = await inspectVideo(videoPath);
    const { state, transport } = mockApple(recording);
    await assert.rejects(
      runAppleReview(env, {
        videoPath,
        operatorEvidence,
        attachmentId: "wrong",
        mode: "submit",
        transport,
      }),
      /APPLE_ATTACHMENT_NOT_COMPLETE_OR_MISMATCH/,
    );
    assert(state.calls.every(({ method }) => method === "GET"));
  }));

test("a previous unresolved submission stops before review notes are changed", async () =>
  fixture(async (videoPath) => {
    const recording = await inspectVideo(videoPath);
    const { state, transport } = mockApple(recording, {
      initialAttachment: {
        type: "appStoreReviewAttachments",
        id: "attach-604",
        attributes: {
          fileName: recording.fileName,
          fileSize: recording.fileSize,
          assetDeliveryState: { state: "COMPLETE" },
          sourceFileChecksum: recording.md5,
        },
        relationships: { appStoreReviewDetail: link("appStoreReviewDetails", "detail-604") },
      },
      initialSubmission: {
        type: "reviewSubmissions",
        id: "submission-604",
        attributes: { state: "UNRESOLVED_ISSUES" },
      },
    });
    state.items = [
      {
        type: "reviewSubmissionItems",
        id: "item-604",
        relationships: { appStoreVersion: link("appStoreVersions", VERSION_ID) },
      },
    ];
    await assert.rejects(
      runAppleReview(env, {
        videoPath,
        operatorEvidence,
        attachmentId: "attach-604",
        mode: "submit",
        transport,
      }),
      /APPLE_SUBMISSION_STATE_NOT_READY/,
    );
    assert(state.calls.every(({ method }) => method === "GET"));
  }));

test("completed recording follows notes and submission with one version item", async () =>
  fixture(async (videoPath) => {
    const recording = await inspectVideo(videoPath);
    const { state, transport } = mockApple(recording, {
      initialAttachment: {
        type: "appStoreReviewAttachments",
        id: "attach-604",
        attributes: {
          fileName: recording.fileName,
          fileSize: recording.fileSize,
          assetDeliveryState: { state: "COMPLETE" },
          sourceFileChecksum: recording.md5,
        },
        relationships: { appStoreReviewDetail: link("appStoreReviewDetails", "detail-604") },
      },
    });
    const result = await runAppleReview(env, {
      videoPath,
      operatorEvidence,
      attachmentId: "attach-604",
      mode: "submit",
      transport,
    });
    assert.equal(result.state, "WAITING_FOR_REVIEW");
    assert.equal(state.items.length, 1);
    assert.equal(
      state.calls.filter(
        (call) => call.method === "POST" && call.path === "/v1/reviewSubmissionItems",
      ).length,
      1,
    );
  }));
