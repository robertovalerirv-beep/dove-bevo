import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";
import { auditFeedback } from "../mobile-testflight-feedback.mjs";
import { decryptFeedback } from "../mobile-testflight-feedback-decrypt.mjs";

const APP =
  "https://api.appstoreconnect.apple.com/v1/apps/6827324444/betaFeedbackScreenshotSubmissions";
const image = "https://is1-ssl.mzstatic.com/feedback/sample.png";
const record = (id, screenshots = []) => ({
  type: "betaFeedbackScreenshotSubmissions",
  id,
  attributes: {
    createdDate: "2026-11-03T12:00:00Z",
    comment: "Ricerca non visibile",
    email: "private@example.com",
    screenshots,
  },
  relationships: { build: { data: { type: "builds", id: "build-72" } } },
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
        data: [record("row-1", [{ url: image, width: 100, height: 200 }])],
        included: [{ type: "builds", id: "build-72", attributes: { version: "72" } }],
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
    const saved = await readFile(file, "utf8");
    for (const sensitive of ["Ricerca non visibile", "private@example.com", image])
      assert.ok(!saved.includes(sensitive));
    const envelope = JSON.parse(saved);
    const pem = privateKey.export({ type: "pkcs8", format: "pem" });
    const payload = decryptFeedback(saved, pem);
    assert.equal(payload.result.feedback[0].comment, "Ricerca non visibile");
    assert.equal(payload.result.feedback[0].build, "72");
    assert.deepEqual(payload.result.feedback[0].screenshots, ["feedback-001-1.png"]);
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
