import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import {
  APP_ID,
  VERSION_ID,
  ORIGIN,
  NOTES_URL,
  NOTES_SHA,
  validateNotes,
  auditReview,
  applyReview,
  sha256,
} from "../mobile-apple-review.mjs";

const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const env = {
  DOVEBEVO_ASC_KEY_ID: "ABCDEFGHIJ",
  DOVEBEVO_ASC_ISSUER_ID: "00000000-0000-4000-8000-000000000000",
  DOVEBEVO_ASC_PRIVATE_KEY: pair.privateKey.export({ type: "pkcs8", format: "pem" }),
};
const relation = (type, id) => ({ data: { type, id } });
const notes = await readFile(NOTES_URL);
// Synthetic operator evidence exists only inside this test; it is not real-device proof.
const proof = () => ({
  appId: APP_ID,
  versionId: VERSION_ID,
  notesSha256: NOTES_SHA,
  attachmentId: "video-1",
  fileName: "device-demo.mp4",
  fileSize: 4096,
  recordingSha256: "a".repeat(64),
  deviceModel: "iPhone 17",
  osVersion: "26.1",
  appVersion: "1.0.0",
  buildNumber: "42",
  captureDate: "2026-11-02",
  latestOSVerifiedOn: "2026-11-02",
  ownerAttested: true,
  reviewerViewed: true,
});
const responses = () => [
  {
    data: {
      type: "appStoreVersions",
      id: VERSION_ID,
      attributes: { platform: "IOS", versionString: "1.0.0" },
      relationships: { app: relation("apps", APP_ID), build: relation("builds", "build-42") },
    },
  },
  {
    data: {
      type: "appStoreReviewDetails",
      id: "detail-1",
      attributes: {
        demoAccountRequired: true,
        notes: "PRIVATE_EXISTING_NOTES",
        contactEmail: "PRIVATE_CONTACT",
      },
      relationships: { appStoreVersion: relation("appStoreVersions", VERSION_ID) },
    },
  },
  {
    data: [
      {
        type: "appStoreReviewAttachments",
        id: "video-1",
        attributes: {
          fileName: "device-demo.mp4",
          fileSize: 4096,
          assetDeliveryState: { state: "COMPLETE" },
          uploadOperations: "PRIVATE_UPLOAD",
        },
        relationships: { appStoreReviewDetail: relation("appStoreReviewDetails", "detail-1") },
      },
    ],
    meta: { paging: { total: 1 } },
  },
  {
    data: {
      type: "builds",
      id: "build-42",
      attributes: { version: "42", processingState: "VALID", expired: false },
      relationships: { app: relation("apps", APP_ID) },
    },
  },
  {
    data: {
      type: "appStoreReviewDetails",
      id: "detail-1",
      attributes: { demoAccountRequired: false, notes: notes.toString("utf8") },
    },
  },
];
function fixture(data = responses()) {
  const calls = [];
  return {
    calls,
    transport: async (url, options) => {
      calls.push({ url, options });
      assert.equal(new URL(url).origin, ORIGIN);
      assert.equal(options.redirect, "error");
      assert.ok(options.signal instanceof globalThis.AbortSignal);
      return new globalThis.Response(JSON.stringify(data[calls.length - 1]), {
        headers: { "content-type": "application/json" },
      });
    },
  };
}

test("curated six-item notes are exact LF bytes and below Apple's limit", () => {
  assert.equal(sha256(notes), NOTES_SHA);
  assert.ok(validateNotes(notes).characters < 4000);
  assert.throws(() => validateNotes(Buffer.concat([notes, Buffer.from("changed")])));
});
test("default audit is three GETs, checks fixed parent relationships and strips sensitive data", async () => {
  const f = fixture();
  const result = await auditReview(env, { transport: f.transport });
  assert.equal(result.complete, true);
  assert.equal(result.applyEnabled, false);
  assert.equal(result.physicalDeviceEvidence, "NOT_ATTESTED");
  assert.equal(result.attachments[0].state, "COMPLETE");
  assert.equal(f.calls.length, 3);
  assert.ok(f.calls.every((c) => c.options.method === "GET"));
  for (const secret of ["PRIVATE", "device-demo.mp4", "Bearer", "uploadOperations"])
    assert.ok(!JSON.stringify(result).includes(secret));
});
test("COMPLETE alone, missing attestations and wrong notes SHA never read credentials or call transport", async () => {
  let calls = 0;
  const transport = async () => {
    calls++;
    throw new Error();
  };
  for (const evidence of [
    undefined,
    {},
    { ...proof(), ownerAttested: false },
    { ...proof(), reviewerViewed: false },
    { ...proof(), notesSha256: "b".repeat(64) },
    { ...proof(), deviceModel: "Simulator" },
    { ...proof(), captureDate: "2099-01-01" },
  ]) {
    await assert.rejects(applyReview({}, { transport, evidence, expectedNotesSha: NOTES_SHA }));
  }
  await assert.rejects(applyReview({}, { transport, evidence: proof(), expectedNotesSha: "bad" }));
  await assert.rejects(auditReview({}, { transport, apply: true }));
  assert.equal(calls, 0);
});
test("wrong fixed app/version, attachment parent and duplicate resources fail closed", async () => {
  for (const mutate of [
    (d) => {
      d[0].data.relationships.app.data.id = "123";
    },
    (d) => {
      d[0].data.id = "wrong";
    },
    (d) => {
      d[1].data.relationships.appStoreVersion.data.id = "wrong";
    },
    (d) => {
      d[2].data[0].relationships.appStoreReviewDetail.data.id = "wrong";
    },
    (d) => {
      d[2].data.push(d[2].data[0]);
      d[2].meta.paging.total = 2;
    },
    (d) => {
      d[2].links = { next: "https://untrusted.invalid" };
    },
    (d) => {
      d[2].meta.paging.total = 51;
    },
  ]) {
    const d = responses();
    mutate(d);
    const f = fixture(d);
    assert.equal((await auditReview(env, { transport: f.transport })).complete, false);
    assert.ok(f.calls.every((c) => c.options.method === "GET"));
  }
});
test("reviewed manual evidence plus COMPLETE exact attachment and current build enables only the narrow PATCH", async () => {
  const f = fixture();
  const result = await applyReview(env, {
    transport: f.transport,
    evidence: proof(),
    expectedNotesSha: NOTES_SHA,
  });
  assert.equal(result.applied, true);
  assert.equal(result.physicalDeviceEvidence, "MANUALLY_ATTESTED_NOT_CRYPTOGRAPHIC_PROOF");
  assert.equal(f.calls.length, 5);
  const patch = f.calls[4];
  assert.equal(patch.url, ORIGIN + "/v1/appStoreReviewDetails/detail-1");
  assert.equal(patch.options.method, "PATCH");
  assert.deepEqual(JSON.parse(patch.options.body), {
    data: {
      type: "appStoreReviewDetails",
      id: "detail-1",
      attributes: { notes: notes.toString("utf8"), demoAccountRequired: false },
    },
  });
  assert.ok(!JSON.stringify(result).includes("PRIVATE"));
});
test("attachment/build mismatch prevents every write", async () => {
  for (const mutate of [
    (d) => {
      d[2].data[0].attributes.assetDeliveryState.state = "UPLOAD_COMPLETE";
    },
    (d) => {
      d[2].data[0].attributes.fileName = "other.mp4";
    },
    (d) => {
      d[2].data[0].attributes.fileSize++;
    },
    (d) => {
      d[0].data.attributes.versionString = "2.0.0";
    },
    (d) => {
      d[3].data.attributes.version = "43";
    },
    (d) => {
      d[3].data.attributes.expired = true;
    },
    (d) => {
      d[3].data.relationships.app.data.id = "other";
    },
  ]) {
    const d = responses();
    mutate(d);
    const f = fixture(d);
    assert.equal(
      (
        await applyReview(env, {
          transport: f.transport,
          evidence: proof(),
          expectedNotesSha: NOTES_SHA,
        })
      ).complete,
      false,
    );
    assert.ok(f.calls.every((c) => c.options.method === "GET"));
  }
});
test("real Response stream bounds, HTTP errors, malformed JSON and redirects fail closed without provider text", async () => {
  for (const response of [
    () => new globalThis.Response("PRIVATE", { status: 401 }),
    () =>
      new globalThis.Response("PRIVATE", {
        status: 302,
        headers: { location: "https://evil.invalid" },
      }),
    () => new globalThis.Response("PRIVATE", { headers: { "content-type": "text/html" } }),
    () => new globalThis.Response("{PRIVATE", { headers: { "content-type": "application/json" } }),
    () =>
      new globalThis.Response("x".repeat(262145), {
        headers: { "content-type": "application/json" },
      }),
    () =>
      new globalThis.Response("{}", {
        headers: { "content-type": "application/json", "content-length": "999999" },
      }),
  ]) {
    const result = await auditReview(env, { transport: async () => response() });
    assert.equal(result.complete, false);
    assert.ok(!JSON.stringify(result).includes("PRIVATE"));
  }
  const result = await auditReview(env, {
    transport: async () => {
      throw new Error("Bearer PRIVATE");
    },
  });
  assert.equal(result.complete, false);
  assert.ok(!JSON.stringify(result).includes("PRIVATE"));
});
test("uncertain PATCH outcome is not retried or reported as applied", async () => {
  const f = fixture();
  const transport = async (url, options) => {
    if (options.method === "PATCH") {
      f.calls.push({ url, options });
      throw new Error("PRIVATE");
    }
    return f.transport(url, options);
  };
  const result = await applyReview(env, {
    transport,
    evidence: proof(),
    expectedNotesSha: NOTES_SHA,
  });
  assert.equal(result.error, "APPLY_OUTCOME_UNKNOWN_DO_NOT_RETRY_WITHOUT_READBACK");
  assert.equal(result.complete, false);
  assert.equal(f.calls.filter((c) => c.options.method === "PATCH").length, 1);
});
test("workflow is fixed repository/exact audit tag, contains no apply command or new environment", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/mobile-apple-review.yml", import.meta.url),
    "utf8",
  );
  assert.ok(workflow.includes("github.repository == 'robertovalerirv-beep/dove-bevo'"));
  assert.ok(workflow.includes("github.ref == 'refs/tags/mobile-apple-review-audit/20261102-v1'"));
  assert.ok(!workflow.includes("--apply"));
  assert.ok(!/^\s*environment:/m.test(workflow));
  assert.ok(!/^ {4}env:/m.test(workflow));
  assert.ok(workflow.includes("OUTPUT_PATH: ${{ runner.temp }}/apple-review-audit.json"));
});
test("real CLI warns of unknown outcome after PATCH and receipt write/fsync failure, without retry", () => {
  for (const failAt of ["write", "sync"])
    for (const patchOutcome of ["success", "lost-response"]) {
      // Preload only in this child: synthetic credentials, responses and evidence; no network or disk writes.
      const preload = `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const originalRead = fs.promises.readFile;
      fs.promises.readFile = async (path, ...rest) => path === 'synthetic-evidence.json'
        ? Buffer.from(${JSON.stringify(JSON.stringify(proof()))}) : originalRead(path, ...rest);
      fs.promises.open = async () => ({
        writeFile: async () => { if (${JSON.stringify(failAt)} === 'write') throw new Error('PRIVATE_WRITE'); },
        sync: async () => { if (${JSON.stringify(failAt)} === 'sync') throw new Error('PRIVATE_SYNC'); },
        close: async () => {}
      });
      syncBuiltinESMExports();
      const responses = ${JSON.stringify(responses())};
      let calls = 0;
      globalThis.fetch = async (url, options) => {
        if (options.method === 'PATCH') {
          console.log('TEST_PATCH_CALLED');
          if (${JSON.stringify(patchOutcome)} === 'lost-response') throw new Error('PRIVATE_LOST');
        }
        return new Response(JSON.stringify(responses[calls++]), { headers: { 'content-type': 'application/json' } });
      };
    `;
      const child = spawnSync(
        process.execPath,
        [
          "--import",
          "data:text/javascript," + encodeURIComponent(preload),
          fileURLToPath(new URL("../mobile-apple-review.mjs", import.meta.url)),
          "synthetic-receipt.json",
          "--apply",
          "--evidence",
          "synthetic-evidence.json",
          "--notes-sha",
          NOTES_SHA,
        ],
        { encoding: "utf8", env: { SystemRoot: process.env.SystemRoot, ...env }, timeout: 10000 },
      );
      assert.ifError(child.error);
      assert.equal(child.status, 1, child.stderr);
      assert.equal(child.stdout.match(/TEST_PATCH_CALLED/g)?.length, 1, child.stderr);
      assert.match(child.stderr, /outcome may be unknown/);
      assert.match(child.stderr, /read back Apple review details before retrying/);
      assert.doesNotMatch(child.stderr, /no metadata was changed|PRIVATE/);
    }
});
