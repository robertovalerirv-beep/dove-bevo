import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, readFile, rm, mkdir, open } from "node:fs/promises";
import { URL } from "node:url";
import path from "node:path";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  APP_ID,
  VERSION_ID,
  LOCALIZATION_ID,
  SETS,
  canonicalPlan,
  loadPlan,
  uploadParts,
  screenshots,
} from "../mobile-apple-screenshots.mjs";

const hash = (b, algorithm = "sha256") => createHash(algorithm).update(b).digest("hex");
const object = (type, id, attributes = {}) => ({ type, id, attributes });
const response = (data, status = 200) =>
  new globalThis.Response(status === 204 ? null : JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
async function fixture() {
  const root = path.resolve(".task-tmp/apple-screenshot-tests");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, "run-"));
  const plan = {
    schemaVersion: 1,
    appId: APP_ID,
    versionId: VERSION_ID,
    localizationId: LOCALIZATION_ID,
    assets: [],
    old: [],
  };
  let serial = 0;
  for (const [setId, dimensions] of Object.entries(SETS))
    for (let i = 0; i < 3; i++) {
      const bytes = Buffer.alloc(33);
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
      bytes.writeUInt32BE(13, 8);
      bytes.write("IHDR", 12);
      bytes.writeUInt32BE(dimensions.width, 16);
      bytes.writeUInt32BE(dimensions.height, 20);
      bytes[24] = 8;
      bytes[25] = 2;
      bytes[32] = serial++;
      const name = `new-${serial}.png`;
      await writeFile(path.join(directory, name), bytes);
      const pins = { bytes: bytes.length, sha256: hash(bytes), md5: hash(bytes, "md5") };
      plan.assets.push({
        setId,
        fileName: name,
        path: name,
        ...pins,
        width: dimensions.width,
        height: dimensions.height,
        sourcePath: name,
        sourceSha256: pins.sha256,
      });
      plan.old.push({ setId, id: `old-${serial}`, path: name, ...pins });
    }
  const planFile = path.join(directory, "plan.json"),
    receiptFile = path.join(directory, "receipt.json");
  async function save() {
    const bytes = canonicalPlan(plan);
    await writeFile(planFile, bytes);
    return hash(bytes);
  }
  const sha = await save();
  return {
    plan,
    planFile,
    receiptFile,
    sha,
    save,
    close: () => rm(directory, { recursive: true, force: true }),
  };
}
function server(f, tweak = {}) {
  const calls = [],
    records = new Map(
      f.plan.old.map((e) => [
        e.id,
        {
          setId: e.setId,
          row: object("appScreenshots", e.id, {
            fileSize: e.bytes,
            sourceFileChecksum: e.md5,
            assetDeliveryState: { state: "COMPLETE" },
          }),
        },
      ]),
    );
  let next = 0;
  const transport = async (url, options) => {
    calls.push({ url, ...options });
    if (tweak.reject?.(url, options, calls))
      throw new Error("PRIVATE_URL_OR_SECRET_MUST_NOT_ESCAPE");
    if (url.startsWith("https://store-001.blobstore.apple.com/")) {
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(
        Object.values(options.headers).some((v) => String(v).includes("TEST_JWT")),
        false,
      );
      return new globalThis.Response(null, { status: 200 });
    }
    assert.equal(new URL(url).origin, "https://api.appstoreconnect.apple.com");
    assert.equal(options.headers.Authorization, "Bearer TEST_JWT");
    assert.equal(options.redirect, "error");
    const pathname = new URL(url).pathname;
    if (pathname === `/v1/apps/${APP_ID}/appStoreVersions`)
      return response([
        object("appStoreVersions", tweak.wrongParent ? "wrong" : VERSION_ID, {
          platform: "IOS",
          versionString: "1.0.0",
        }),
      ]);
    if (pathname === `/v1/appStoreVersions/${VERSION_ID}/appStoreVersionLocalizations`)
      return response([object("appStoreVersionLocalizations", LOCALIZATION_ID, { locale: "it" })]);
    if (pathname === `/v1/appStoreVersionLocalizations/${LOCALIZATION_ID}/appScreenshotSets`)
      return response(
        Object.entries(SETS).map(([id, s]) =>
          object("appScreenshotSets", id, { screenshotDisplayType: s.type }),
        ),
      );
    const list = pathname.match(/^\/v1\/appScreenshotSets\/([^/]+)\/appScreenshots$/);
    if (list) {
      const rows = [...records.values()].filter((e) => e.setId === list[1]).map((e) => e.row);
      if (tweak.extraMember && next === 6) rows.push(object("appScreenshots", "unrelated"));
      return response(rows);
    }
    if (pathname === "/v1/appScreenshots" && options.method === "POST") {
      const data = JSON.parse(options.body).data,
        asset = f.plan.assets[next++],
        id = `new-${next}`;
      assert.equal(data.relationships.appScreenshotSet.data.id, asset.setId);
      const row = object("appScreenshots", id, {
        ...data.attributes,
        assetDeliveryState: { state: "AWAITING_UPLOAD" },
        uploadOperations: [
          {
            method: "PUT",
            url: tweak.unsafeHost
              ? "https://attacker.example/upload"
              : "https://store-001.blobstore.apple.com/upload?signed=PRIVATE",
            offset: 0,
            length: asset.bytes,
            requestHeaders: [{ name: "Content-Type", value: "image/png" }],
          },
        ],
      });
      records.set(id, { setId: asset.setId, row });
      return response(row, 201);
    }
    const match = pathname.match(/^\/v1\/appScreenshots\/([^/]+)$/);
    assert.ok(match);
    const id = match[1],
      entry = records.get(id);
    assert.ok(entry);
    if (options.method === "PATCH") {
      const data = JSON.parse(options.body).data;
      assert.equal(data.attributes.uploaded, true);
      const asset = f.plan.assets.find((a) => a.fileName === entry.row.attributes.fileName);
      assert.equal(data.attributes.sourceFileChecksum, asset.md5);
      Object.assign(entry.row.attributes, {
        sourceFileChecksum: asset.md5,
        assetDeliveryState: {
          state: tweak.processingFailed
            ? "FAILED"
            : tweak.processingPending
              ? "UPLOAD_COMPLETE"
              : "COMPLETE",
        },
        imageAsset: { width: asset.width, height: asset.height },
      });
      return response(entry.row);
    }
    if (options.method === "DELETE") {
      assert.ok(id.startsWith("old-"));
      assert.equal(next, 6);
      assert.equal(
        [...records.values()].filter(
          (e) =>
            e.row.id.startsWith("new-") && e.row.attributes.assetDeliveryState.state === "COMPLETE",
        ).length,
        6,
      );
      records.delete(id);
      return response(null, 204);
    }
    return response(entry.row);
  };
  return { calls, transport, records };
}
const run = (f, s, extra = {}) =>
  screenshots(
    {},
    {
      planFile: f.planFile,
      receiptFile: f.receiptFile,
      approvedSha256: f.sha,
      transport: s.transport,
      tokenProvider: () => "TEST_JWT",
      pause: async () => {},
      ...extra,
    },
  );

test("audit validates exact local pack and fixed parent chain using GET only", async () => {
  const f = await fixture();
  try {
    const s = server(f),
      result = await run(f, s);
    assert.equal(result.phase, "audited");
    assert.equal(s.calls.length, 5);
    assert.ok(s.calls.every((c) => c.method === "GET"));
    assert.ok(!JSON.stringify(result).includes("TEST_JWT"));
  } finally {
    await f.close();
  }
});
test("apply stages six complete checksummed images before deleting exactly original six", async () => {
  const f = await fixture();
  try {
    const s = server(f),
      result = await run(f, s, { apply: true });
    assert.equal(result.phase, "complete");
    assert.equal(s.records.size, 6);
    const receipt = await readFile(f.receiptFile, "utf8");
    assert.ok(!/TEST_JWT|blobstore|signed=/.test(receipt));
    assert.equal(result.operations.filter((o) => o.method === "DELETE").length, 6);
  } finally {
    await f.close();
  }
});
test("wrong parent prevents all writes", async () => {
  const f = await fixture();
  try {
    const s = server(f, { wrongParent: true });
    await assert.rejects(run(f, s, { apply: true }));
    assert.ok(s.calls.every((c) => c.method === "GET"));
  } finally {
    await f.close();
  }
});
for (const fault of ["hash", "magic", "dimensions", "source", "path", "approval", "canonical"])
  test(`local ${fault} rejection precedes credential access`, async () => {
    const f = await fixture();
    try {
      if (fault === "hash") f.plan.assets[0].sha256 = "a".repeat(64);
      if (fault === "dimensions") f.plan.assets[0].width = 1;
      if (fault === "source") f.plan.assets[0].sourceSha256 = "a".repeat(64);
      if (fault === "path") f.plan.assets[0].path = "../outside.png";
      if (fault === "magic") {
        const data = await readFile(path.join(path.dirname(f.planFile), f.plan.assets[0].path));
        data[0] = 0;
        await writeFile(path.join(path.dirname(f.planFile), f.plan.assets[0].path), data);
        f.plan.assets[0].sha256 = hash(data);
        f.plan.assets[0].md5 = hash(data, "md5");
      }
      f.sha = await f.save();
      if (fault === "canonical") await writeFile(f.planFile, JSON.stringify(f.plan));
      let credentials = 0;
      await assert.rejects(
        screenshots(
          {},
          {
            planFile: f.planFile,
            approvedSha256: fault === "approval" ? "0".repeat(64) : f.sha,
            apply: true,
            receiptFile: f.receiptFile,
            tokenProvider: () => {
              credentials++;
              return "TOKEN";
            },
          },
        ),
      );
      assert.equal(credentials, 0);
    } finally {
      await f.close();
    }
  });
test("unsafe upload host stops without storage call or old deletion", async () => {
  const f = await fixture();
  try {
    const s = server(f, { unsafeHost: true });
    await assert.rejects(run(f, s, { apply: true }));
    assert.ok(s.calls.every((c) => !c.url.includes("attacker") && c.method !== "DELETE"));
  } finally {
    await f.close();
  }
});
test("failed processing preserves all six originals", async () => {
  const f = await fixture();
  try {
    const s = server(f, { processingFailed: true });
    await assert.rejects(run(f, s, { apply: true }));
    assert.equal([...s.records.keys()].filter((id) => id.startsWith("old-")).length, 6);
    assert.ok(!s.calls.some((c) => c.method === "DELETE"));
  } finally {
    await f.close();
  }
});
test("lost reservation response leaves durable intent and never retries", async () => {
  const f = await fixture();
  try {
    const s = server(f, { reject: (url, o) => o.method === "POST" });
    await assert.rejects(run(f, s, { apply: true }));
    assert.equal(s.calls.filter((c) => c.method === "POST").length, 1);
    const receipt = JSON.parse((await readFile(f.receiptFile, "utf8")).trim().split("\n").at(-1));
    assert.equal(receipt.operations.at(-1).outcome, "intent");
    assert.ok(!s.calls.some((c) => c.method === "DELETE"));
    await assert.rejects(run(f, s, { apply: true }));
    assert.equal(s.calls.filter((c) => c.method === "POST").length, 1);
  } finally {
    await f.close();
  }
});
test("fresh membership containing unrelated image prevents every deletion", async () => {
  const f = await fixture();
  try {
    const s = server(f, { extraMember: true });
    await assert.rejects(run(f, s, { apply: true }));
    assert.ok(!s.calls.some((c) => c.method === "DELETE"));
  } finally {
    await f.close();
  }
});
test("backup checksum mismatch prevents reservation", async () => {
  const f = await fixture();
  try {
    const s = server(f);
    s.records.get(f.plan.old[0].id).row.attributes.sourceFileChecksum = "f".repeat(32);
    await assert.rejects(run(f, s, { apply: true }));
    assert.ok(!s.calls.some((c) => c.method === "POST"));
  } finally {
    await f.close();
  }
});
test("upload operations reject gaps, overlaps, credentials and non-Apple hosts", () => {
  const base = {
    method: "PUT",
    url: "https://store-001.blobstore.apple.com/upload",
    offset: 0,
    length: 2,
    requestHeaders: [],
  };
  for (const op of [
    { ...base, offset: 1 },
    { ...base, length: 3 },
    { ...base, url: "https://store-001.blobstore.apple.com.attacker.test/x" },
    { ...base, requestHeaders: [{ name: "Authorization", value: "Bearer TEST_JWT" }] },
    { ...base, url: "http://store-001.blobstore.apple.com/x" },
  ])
    assert.throws(() => uploadParts([op], 2));
  assert.equal(uploadParts([base], 2).length, 1);
});
test("local loaded source bytes are immutable input to ranged upload", async () => {
  const f = await fixture();
  try {
    const loaded = await loadPlan(f.planFile, f.sha, true);
    assert.equal(hash(loaded.assets[0].data), f.plan.assets[0].sha256);
  } finally {
    await f.close();
  }
});

test("receipt fsync failure after reservation stops before upload and retains prior intent", async () => {
  const f = await fixture();
  try {
    const s = server(f);
    let syncs = 0;
    await assert.rejects(
      run(f, s, {
        apply: true,
        journalFactory: async (...args) => {
          const handle = await open(...args);
          return {
            writeFile: (...a) => handle.writeFile(...a),
            sync: async () => {
              if (++syncs === 3) throw new Error("DISK_FAILURE");
              await handle.sync();
            },
            close: () => handle.close(),
          };
        },
      }),
      /read back state/,
    );
    assert.equal(s.calls.filter((c) => c.method === "POST").length, 1);
    assert.ok(!s.calls.some((c) => c.method === "PUT" || c.method === "DELETE"));
    const snapshots = (await readFile(f.receiptFile, "utf8")).trim().split("\n").map(JSON.parse);
    assert.ok(snapshots.some((r) => r.operations.at(-1)?.outcome === "intent"));
  } finally {
    await f.close();
  }
});

for (const fault of ["redirect", "oversized", "pagination", "http", "raw-secret-error"])
  test(`transport ${fault} is bounded and sanitized without writes`, async () => {
    const f = await fixture();
    try {
      let calls = 0;
      const transport = async (_url, options) => {
        calls++;
        assert.equal(options.method, "GET");
        assert.equal(options.redirect, "error");
        if (fault === "raw-secret-error") throw new Error("PRIVATE_SIGNED_URL_AND_TOKEN");
        if (fault === "redirect") return new globalThis.Response(null, { status: 302 });
        if (fault === "http") return response([], 403);
        if (fault === "oversized")
          return new globalThis.Response("x".repeat(262145), {
            headers: { "Content-Type": "application/json" },
          });
        return new globalThis.Response(
          JSON.stringify({ data: [], links: { next: "PRIVATE_URL" } }),
          { headers: { "Content-Type": "application/json" } },
        );
      };
      await assert.rejects(
        run(f, { transport }, { apply: true }),
        (error) => !/PRIVATE|TOKEN/.test(error.message) && /read back state/.test(error.message),
      );
      assert.equal(calls, 1);
    } finally {
      await f.close();
    }
  });

test("lost delete acknowledgement stops immediately without retrying or deleting another id", async () => {
  const f = await fixture();
  try {
    const s = server(f, { reject: (_url, options) => options.method === "DELETE" });
    await assert.rejects(run(f, s, { apply: true }), /read back state/);
    const deletes = s.calls.filter((c) => c.method === "DELETE");
    assert.equal(deletes.length, 1);
    assert.ok(deletes[0].url.endsWith(f.plan.old[0].id));
    const last = JSON.parse((await readFile(f.receiptFile, "utf8")).trim().split("\n").at(-1));
    assert.equal(last.operations.at(-1).outcome, "intent");
  } finally {
    await f.close();
  }
});

test("pending processing stops at exactly thirty reads with no original deletion", async () => {
  const f = await fixture();
  try {
    const s = server(f, { processingPending: true });
    let pauses = 0;
    await assert.rejects(
      run(f, s, {
        apply: true,
        pause: async () => {
          pauses++;
        },
      }),
    );
    assert.equal(
      s.calls.filter(
        (c) => c.method === "GET" && new URL(c.url).pathname === "/v1/appScreenshots/new-1",
      ).length,
      30,
    );
    assert.equal(pauses, 29);
    assert.ok(!s.calls.some((c) => c.method === "DELETE"));
  } finally {
    await f.close();
  }
});

test("reflected ASC token in upload-operation header never reaches storage", async () => {
  const f = await fixture();
  try {
    const s = server(f),
      original = s.transport;
    const transport = async (url, options) => {
      const result = await original(url, options);
      if (options.method !== "POST") return result;
      const body = await result.json();
      body.data.attributes.uploadOperations[0].requestHeaders = [
        { name: "Content-Type", value: "TEST_JWT" },
      ];
      return response(body.data, 201);
    };
    await assert.rejects(run(f, { transport }, { apply: true }));
    assert.ok(!s.calls.some((c) => c.method === "PUT" || c.method === "DELETE"));
  } finally {
    await f.close();
  }
});

test("lost ranged PUT response stops with no retry or old deletion", async () => {
  const f = await fixture();
  try {
    const s = server(f, { reject: (_url, options) => options.method === "PUT" });
    await assert.rejects(run(f, s, { apply: true }));
    assert.equal(s.calls.filter((c) => c.method === "PUT").length, 1);
    assert.ok(!s.calls.some((c) => c.method === "PATCH" || c.method === "DELETE"));
  } finally {
    await f.close();
  }
});

for (const [type, key, parentType] of [
  ["appStoreVersions", "app", "apps"],
  ["appStoreVersionLocalizations", "appStoreVersion", "appStoreVersions"],
  ["appScreenshotSets", "appStoreVersionLocalization", "appStoreVersionLocalizations"],
  ["appScreenshots", "appScreenshotSet", "appScreenshotSets"],
])
  test(`explicit contradictory ${type} parent fails before writes`, async () => {
    const f = await fixture();
    try {
      const s = server(f),
        original = s.transport;
      const transport = async (url, options) => {
        const result = await original(url, options),
          body = await result.json();
        if (Array.isArray(body.data) && body.data[0]?.type === type)
          body.data[0].relationships = {
            [key]: { data: { type: parentType, id: "wrong-parent" } },
          };
        return response(body.data);
      };
      await assert.rejects(run(f, { transport }, { apply: true }));
      assert.ok(s.calls.every((c) => c.method === "GET"));
    } finally {
      await f.close();
    }
  });
