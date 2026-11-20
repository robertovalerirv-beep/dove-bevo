import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";
import { auditFeedback } from "../mobile-testflight-feedback.mjs";
import { decryptFeedback, saveFeedback } from "../mobile-testflight-feedback-decrypt.mjs";

const APP =
  "https://api.appstoreconnect.apple.com/v1/apps/6827324444/betaFeedbackScreenshotSubmissions";
const image = "https://is1-ssl.mzstatic.com/feedback/sample.png";
const record = (id, screenshots = [], buildId = "build-72") => ({
  type: "betaFeedbackScreenshotSubmissions",
  id,
  attributes: {
    createdDate: "2026-11-03T12:00:00Z",
    comment: "Ricerca non visibile",
    email: "private@example.com",
    screenshots,
  },
  relationships: { build: { data: { type: "builds", id: buildId } } },
});
const json = (body) =>
  new globalThis.Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
async function withOutput(fn) {
  const base = resolve(".task-tmp");
  await mkdir(base, { recursive: true });
  const file = join(base, `testflight-feedback-${randomUUID()}.enc.json`);
  try {
    await fn(file);
  } finally {
    assert.equal(resolve(file).startsWith(base + sep), true);
    await rm(file, { force: true });
  }
}

test("encrypts all pages and images without exporting tester identity or signed URLs", async () => {
  await withOutput(async (file) => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
    const seen = [];
    const fetcher = async (url, options) => {
      seen.push({ url, options });
      if (url === image)
        return new globalThis.Response(Buffer.from([137, 80, 78, 71]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      if (url.includes("cursor=second"))
        return json({ data: [record("row-2")], included: [], links: {} });
      return json({
        data: [record("row_1", [{ url: image, width: 100, height: 200 }], "build_72")],
        included: [{ type: "builds", id: "build_72", attributes: { version: "72" } }],
        links: { next: APP + "?cursor=second" },
      });
    };
    const result = await auditFeedback(
      {},
      file,
      fetcher,
      () => "ephemeral-token",
      publicKey.export({ type: "spki", format: "pem" }),
    );
    assert.equal(result.feedback_count, 2);
    assert.equal(result.image_count, 1);
    assert.equal(result.image_expected_count, 1);
    assert.equal(result.image_unavailable_count, 0);
    assert.equal(result.complete, true);
    const saved = await readFile(file, "utf8");
    for (const sensitive of ["Ricerca non visibile", "private@example.com", image])
      assert.ok(!saved.includes(sensitive));
    const envelope = JSON.parse(saved);
    const pem = privateKey.export({ type: "pkcs8", format: "pem" });
    const payload = decryptFeedback(saved, pem);
    assert.equal(payload.result.feedback[0].comment, "Ricerca non visibile");
    assert.equal(payload.result.feedback[0].build, "72");
    assert.deepEqual(payload.result.feedback[0].screenshots, ["feedback-001-1.png"]);
    assert.equal(payload.result.feedback[0].screenshot_count, 1);
    assert.equal(payload.result.feedback[0].unavailable_screenshot_count, 0);
    assert.equal(payload.images[0].filename, "feedback-001-1.png");
    assert.throws(
      () => decryptFeedback(JSON.stringify({ ...envelope, tag: "AAAAAAAAAAAAAAAAAAAAAA==" }), pem),
      /authenticate|Unsupported state/i,
    );
    assert.equal(seen.filter((call) => call.url.startsWith(APP)).length, 2);
    assert.ok(
      seen
        .filter((call) => call.url.startsWith(APP))
        .every(
          (call) =>
            call.options.method === "GET" &&
            call.options.headers.Authorization === "Bearer ephemeral-token",
        ),
    );
    assert.equal(seen.find((call) => call.url === image).options.headers.Authorization, undefined);
  });
});

test("encrypts incomplete metadata when signed screenshots cannot be fetched", async () => {
  await withOutput(async (file) => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
    const missingTransport = "https://is1-ssl.mzstatic.com/feedback/unavailable-transport.png";
    const missingHttp = "https://is1-ssl.mzstatic.com/feedback/unavailable-http.png";
    const fetcher = async (url) => {
      if (url === missingTransport) throw new TypeError("private signed image URL must stay hidden");
      if (url === missingHttp) return new globalThis.Response("private response", { status: 503 });
      if (url === image)
        return new globalThis.Response(Buffer.from([137, 80, 78, 71]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      return json({
        data: [
          record("row_1", [{ url: image }, { url: missingTransport }], "build_72"),
          record("row_2", [{ url: missingHttp }], "build_72"),
        ],
        included: [{ type: "builds", id: "build_72", attributes: { version: "72" } }],
        links: {},
      });
    };
    const result = await auditFeedback(
      {},
      file,
      fetcher,
      () => "ephemeral-token",
      publicKey.export({ type: "spki", format: "pem" }),
    );
    assert.equal(result.complete, false);
    assert.equal(result.feedback_count, 2);
    assert.equal(result.image_count, 1);
    assert.equal(result.image_expected_count, 3);
    assert.equal(result.image_unavailable_count, 2);
    assert.deepEqual(result.image_unavailable_reasons, { transport: 1, http_or_redirect: 1 });
    const saved = await readFile(file, "utf8");
    for (const sensitive of ["Ricerca non visibile", missingTransport, missingHttp, "private"])
      assert.ok(!saved.includes(sensitive));
    const payload = decryptFeedback(
      saved,
      privateKey.export({ type: "pkcs8", format: "pem" }),
    );
    assert.deepEqual(payload.result.feedback[0].screenshots, ["feedback-001-1.png"]);
    assert.equal(payload.result.feedback[0].screenshot_count, 2);
    assert.equal(payload.result.feedback[0].unavailable_screenshot_count, 1);
    assert.equal(payload.result.feedback[1].screenshot_count, 1);
    assert.equal(payload.result.feedback[1].unavailable_screenshot_count, 1);
    assert.equal(payload.images.length, 1);
  });
});

test("stops image requests when the global fetch budget is exhausted", async () => {
  await withOutput(async (file) => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
    const skippedImage = "https://is1-ssl.mzstatic.com/feedback/skipped.png";
    let elapsed = 0;
    let imageCalls = 0;
    const fetcher = async (url) => {
      if (url === skippedImage) throw new Error("Image budget was ignored");
      if (url === image) {
        imageCalls += 1;
        elapsed = 120000;
        return new globalThis.Response(Buffer.from([137, 80, 78, 71]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      return json({
        data: [record("row_1", [{ url: image }, { url: skippedImage }])],
        included: [],
        links: {},
      });
    };
    const result = await auditFeedback(
      {},
      file,
      fetcher,
      () => "ephemeral-token",
      publicKey.export({ type: "spki", format: "pem" }),
      () => {},
      () => elapsed,
    );
    assert.equal(imageCalls, 1);
    assert.equal(result.complete, false);
    assert.equal(result.image_expected_count, 2);
    assert.equal(result.image_count, 1);
    assert.equal(result.image_unavailable_count, 1);
    assert.deepEqual(result.image_unavailable_reasons, { budget_exhausted: 1 });
    const payload = decryptFeedback(
      await readFile(file, "utf8"),
      privateKey.export({ type: "pkcs8", format: "pem" }),
    );
    assert.equal(payload.result.feedback[0].screenshot_count, 2);
    assert.equal(payload.result.feedback[0].unavailable_screenshot_count, 1);
  });
});

test("rejects foreign pagination and image hosts before contacting them", async () => {
  await withOutput(async (file) => {
    let calls = 0;
    await assert.rejects(
      auditFeedback(
        {},
        file,
        async () => {
          calls += 1;
          return json({ data: [], links: { next: "https://outside.example/next" } });
        },
        () => "token",
      ),
      /Unexpected feedback page URL/,
    );
    assert.equal(calls, 1);
  });
  await withOutput(async (file) => {
    let calls = 0;
    await assert.rejects(
      auditFeedback(
        {},
        file,
        async () => {
          calls += 1;
          return json({
            data: [record("row-1", [{ url: "https://outside.example/image.png" }])],
            links: {},
          });
        },
        () => "token",
      ),
      /Unexpected feedback image host/,
    );
    assert.equal(calls, 1);
  });
});

test("reports only bounded stage and HTTP status when Apple's list request fails", async () => {
  await withOutput(async (file) => {
    const states = [];
    await assert.rejects(
      auditFeedback(
        {},
        file,
        async () => new globalThis.Response("private response must not be logged", { status: 403 }),
        () => "ephemeral-token",
        undefined,
        (stage, status) => states.push({ stage, status }),
      ),
      /Feedback read unavailable/,
    );
    assert.deepEqual(states.at(-1), { stage: "list_response", status: 403 });
    assert.ok(
      states.every(({ stage, status }) => /^[a-z_]+$/.test(stage) && Number.isInteger(status)),
    );
    await assert.rejects(access(file));
  });
  await withOutput(async (file) => {
    const states = [];
    await assert.rejects(
      auditFeedback(
        {},
        file,
        async () => json({ data: [{ unexpected: true }] }),
        () => "ephemeral-token",
        undefined,
        (stage, status) => states.push({ stage, status }),
      ),
      /Unexpected feedback record/,
    );
    assert.deepEqual(states.at(-1), { stage: "list_decode", status: 200 });
    await assert.rejects(access(file));
  });
});

test("refuses plaintext inside a Git worktree and validates images before writing", async () => {
  const projectLike = resolve("OneDrive", "Dove Bevo", ".task-tmp", "feedback-output");
  const payload = {
    result: { schema_version: 1, feedback: [] },
    images: [],
  };
  await assert.rejects(saveFeedback(payload, projectLike, process.cwd()), /inside Git checkout/);
  await assert.rejects(access(projectLike));

  const outsideCheckoutProfile = resolve("..");
  const invalidImageTarget = join(
    outsideCheckoutProfile,
    "OneDrive",
    "Dove Bevo",
    ".task-tmp",
    "invalid-image-output",
  );
  await assert.rejects(
    saveFeedback(
      { ...payload, images: [{ filename: "../escape.png", base64: "AA==" }] },
      invalidImageTarget,
      outsideCheckoutProfile,
    ),
    /Unexpected feedback image name/,
  );
  await assert.rejects(access(invalidImageTarget));
});
