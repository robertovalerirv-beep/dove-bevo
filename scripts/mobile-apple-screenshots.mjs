// Local-only operator. No workflow, credentials, asset URLs or response bodies are persisted.
import { createHash } from "node:crypto";
import { readFile, realpath, open } from "node:fs/promises";
import path from "node:path";
import { Buffer } from "node:buffer";
import { pathToFileURL, URL } from "node:url";
import { tokenFor } from "./mobile-store-status.mjs";

export const APP_ID = "6827324444";
export const VERSION_ID = "e01a5724-9314-4ed6-9353-abc5c4a21a07";
export const LOCALIZATION_ID = "7e96802e-cee8-4777-9384-4f743912be38";
export const SETS = Object.freeze({
  "eb509607-4f07-442f-bb14-3c7b7d49fdf5": { type: "APP_IPHONE_61", width: 1206, height: 2622 },
  "0cf30963-b6ba-47d1-9bd7-a75f055abeef": {
    type: "APP_IPAD_PRO_3GEN_129",
    width: 2048,
    height: 2732,
  },
});
const ORIGIN = "https://api.appstoreconnect.apple.com";
const MAX_FILE = 20 * 1024 * 1024;
const digest = (bytes, algorithm = "sha256") => createHash(algorithm).update(bytes).digest("hex");
const check = (ok) => {
  if (!ok) throw new Error("Screenshot operator validation failed");
};
const identifier = (id) => typeof id === "string" && /^[A-Za-z0-9-]{1,100}$/.test(id);
export const canonicalPlan = (plan) => Buffer.from(JSON.stringify(plan, null, 2) + "\n");

export function pngSize(bytes) {
  check(bytes.length >= 33 && bytes.length <= MAX_FILE);
  check(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  check(bytes.readUInt32BE(8) === 13 && bytes.toString("ascii", 12, 16) === "IHDR");
  check(bytes[24] === 8 && bytes[25] === 2); // Eight-bit RGB; no alpha channel.
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  check(width > 0 && height > 0 && width <= 10000 && height <= 10000);
  return { width, height };
}

export async function loadPlan(planFile, approvedSha256, apply = false) {
  check((await realpath(planFile)).toLowerCase() === path.resolve(planFile).toLowerCase());
  const bytes = await readFile(planFile);
  check(bytes.length <= 65536);
  const plan = JSON.parse(bytes.toString("utf8")),
    sha256 = digest(bytes);
  check(bytes.equals(canonicalPlan(plan)));
  check(!apply || (/^[a-f0-9]{64}$/.test(approvedSha256 ?? "") && sha256 === approvedSha256));
  check(
    plan.schemaVersion === 1 &&
      plan.appId === APP_ID &&
      plan.versionId === VERSION_ID &&
      plan.localizationId === LOCALIZATION_ID,
  );
  check(
    Array.isArray(plan.assets) &&
      plan.assets.length === 6 &&
      Array.isArray(plan.old) &&
      plan.old.length === 6,
  );
  const directory = await realpath(path.dirname(planFile));
  async function local(name) {
    check(
      typeof name === "string" && !path.isAbsolute(name) && !name.split(/[\\/]/).includes(".."),
    );
    const target = path.resolve(directory, name),
      actual = await realpath(target);
    check(target.startsWith(directory + path.sep) && actual.toLowerCase() === target.toLowerCase());
    const data = await readFile(actual);
    check(data.length > 0 && data.length <= MAX_FILE);
    return data;
  }
  const assets = [];
  for (const entry of [...plan.assets, ...plan.old]) {
    check(Object.hasOwn(SETS, entry.setId));
    const data = await local(entry.path);
    check(
      data.length === entry.bytes &&
        digest(data) === entry.sha256 &&
        digest(data, "md5") === entry.md5,
    );
    if (plan.assets.includes(entry)) {
      check(/^[A-Za-z0-9_.-]{1,100}\.png$/.test(entry.fileName ?? ""));
      const size = pngSize(data),
        expected = SETS[entry.setId];
      check(
        size.width === entry.width &&
          size.height === entry.height &&
          size.width === expected.width &&
          size.height === expected.height,
      );
      const source = await local(entry.sourcePath);
      pngSize(source);
      check(digest(source) === entry.sourceSha256);
      assets.push({ ...entry, data });
    } else check(identifier(entry.id));
  }
  check(new Set(plan.old.map((entry) => entry.id)).size === 6);
  check(new Set(plan.assets.map((entry) => entry.fileName)).size === 6);
  for (const setId of Object.keys(SETS)) {
    check(
      plan.assets.filter((e) => e.setId === setId).length === 3 &&
        plan.old.filter((e) => e.setId === setId).length === 3,
    );
  }
  return { plan, sha256, assets };
}

export function uploadParts(operations, size) {
  check(Array.isArray(operations) && operations.length > 0 && operations.length <= 32);
  let end = 0;
  return [...operations]
    .sort((a, b) => a.offset - b.offset)
    .map((operation) => {
      const url = new URL(operation.url);
      check(
        url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.hash &&
          (!url.port || url.port === "443"),
      );
      // Apple documentation's upload example uses store-NNN.blobstore.apple.com.
      check(/^store-[0-9]+\.blobstore\.apple\.com$/.test(url.hostname));
      check(
        operation.method === "PUT" &&
          Number.isSafeInteger(operation.offset) &&
          operation.offset === end &&
          Number.isSafeInteger(operation.length) &&
          operation.length > 0,
      );
      end += operation.length;
      check(end <= size && Array.isArray(operation.requestHeaders));
      const headers = {};
      for (const { name, value } of operation.requestHeaders) {
        check(
          typeof name === "string" && /^(content-type|content-md5|x-amz-[a-z0-9-]+)$/i.test(name),
        );
        check(typeof value === "string" && !/[\r\n]/.test(value));
        check(!Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase()));
        headers[name] = value;
      }
      return { url: url.href, headers, offset: operation.offset, length: operation.length };
    })
    .map((part, index, parts) => {
      if (index === parts.length - 1) check(end === size);
      return part;
    });
}

async function boundedJson(response) {
  check(
    !response.redirected &&
      response.ok &&
      /^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? ""),
  );
  const reader = response.body?.getReader();
  check(reader);
  const chunks = [];
  let count = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.length;
      if (count > 262144) {
        await reader.cancel();
        check(false);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  check(body && !body.errors && !body.links?.next);
  return body;
}
function resource(value, type, id) {
  check(value?.type === type && identifier(value.id) && (!id || value.id === id));
  return value;
}
function parentIfPresent(row, key, type, id) {
  if (row.relationships?.[key]?.data !== undefined) resource(row.relationships[key].data, type, id);
}
function list(body, type) {
  check(
    Array.isArray(body.data) &&
      body.data.length <= 200 &&
      new Set(body.data.map((r) => r.id)).size === body.data.length,
  );
  check(body.meta?.paging?.total === undefined || body.meta.paging.total === body.data.length);
  return body.data.map((r) => resource(r, type));
}

export async function screenshots(env, options) {
  const {
    planFile,
    approvedSha256,
    apply = false,
    receiptFile,
    transport = globalThis.fetch,
    tokenProvider = tokenFor,
    journalFactory = open,
    pause = () => new Promise((resolve) => globalThis.setTimeout(resolve, 2000)),
  } = options;
  // All local identity, file and source checks precede credential access, including in audit mode.
  const loaded = await loadPlan(planFile, approvedSha256, apply),
    { plan, assets } = loaded;
  let journal;
  const receipt = {
    schemaVersion: 1,
    appId: APP_ID,
    versionId: VERSION_ID,
    localizationId: LOCALIZATION_ID,
    planSha256: loaded.sha256,
    mode: apply ? "apply" : "audit",
    phase: "validated",
    operations: [],
  };
  async function persist() {
    check(journal);
    // Append complete snapshots: a failed later write never truncates a prior durable intent.
    await journal.writeFile(JSON.stringify(receipt) + "\n");
    await journal.sync();
  }
  try {
    if (apply) {
      check(typeof receiptFile === "string");
      journal = await journalFactory(receiptFile, "wx", 0o600);
      await persist();
    }
    const issuedTokens = new Set();
    let requests = 0;
    async function api(route, method = "GET", data) {
      check(++requests <= 400);
      check(/^\/v1\/[A-Za-z0-9/?=&_-]+$/.test(route));
      // Six uploads and processing polls can outlive the helper's short token lifetime.
      const token = tokenProvider(env);
      check(
        typeof token === "string" &&
          token.length > 0 &&
          token.length <= 16384 &&
          !/[\r\n]/.test(token),
      );
      issuedTokens.add(token);
      const response = await transport(ORIGIN + route, {
        method,
        redirect: "error",
        signal: globalThis.AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(data ? { "Content-Type": "application/json" } : {}),
        },
        ...(data ? { body: JSON.stringify({ data }) } : {}),
      });
      check(response.status === (method === "POST" ? 201 : method === "DELETE" ? 204 : 200));
      if (method === "DELETE") {
        check(!response.redirected);
        return;
      }
      return boundedJson(response);
    }
    async function mutation(route, method, data, safe) {
      check(apply);
      receipt.operations.push({ method, ...safe, outcome: "intent" });
      await persist();
      const result = await api(route, method, data);
      receipt.operations.at(-1).outcome = "acknowledged";
      if (result?.data?.id && identifier(result.data.id))
        receipt.operations.at(-1).resultId = result.data.id;
      await persist();
      return result;
    }
    async function parents() {
      const versions = list(
        await api(`/v1/apps/${APP_ID}/appStoreVersions?limit=200`),
        "appStoreVersions",
      );
      const version = versions.find((v) => v.id === VERSION_ID);
      check(
        version?.attributes?.platform === "IOS" && version.attributes.versionString === "1.0.0",
      );
      parentIfPresent(version, "app", "apps", APP_ID);
      const locales = list(
        await api(`/v1/appStoreVersions/${VERSION_ID}/appStoreVersionLocalizations?limit=200`),
        "appStoreVersionLocalizations",
      );
      const locale = locales.find((v) => v.id === LOCALIZATION_ID);
      check(locale?.attributes?.locale === "it");
      parentIfPresent(locale, "appStoreVersion", "appStoreVersions", VERSION_ID);
      const sets = list(
        await api(
          `/v1/appStoreVersionLocalizations/${LOCALIZATION_ID}/appScreenshotSets?limit=200`,
        ),
        "appScreenshotSets",
      );
      for (const [id, expected] of Object.entries(SETS)) {
        const set = sets.find((s) => s.id === id);
        check(set?.attributes?.screenshotDisplayType === expected.type);
        parentIfPresent(
          set,
          "appStoreVersionLocalization",
          "appStoreVersionLocalizations",
          LOCALIZATION_ID,
        );
      }
    }
    async function members(setId) {
      const rows = list(
        await api(`/v1/appScreenshotSets/${setId}/appScreenshots?limit=200`),
        "appScreenshots",
      );
      for (const row of rows) parentIfPresent(row, "appScreenshotSet", "appScreenshotSets", setId);
      return rows;
    }
    function oldMatches(entry, row) {
      check(
        row &&
          row.attributes?.fileSize === entry.bytes &&
          row.attributes.sourceFileChecksum === entry.md5 &&
          row.attributes.assetDeliveryState?.state === "COMPLETE",
      );
    }
    await parents();
    for (const setId of Object.keys(SETS)) {
      const current = await members(setId),
        expected = plan.old.filter((e) => e.setId === setId);
      check(current.length === 3 && current.every((r) => expected.some((e) => e.id === r.id)));
      for (const entry of expected)
        oldMatches(
          entry,
          current.find((r) => r.id === entry.id),
        );
    }
    receipt.phase = "audited";
    if (!apply) return receipt;
    const staged = [];
    for (const asset of assets) {
      const row = resource(
        (
          await mutation(
            "/v1/appScreenshots",
            "POST",
            {
              type: "appScreenshots",
              attributes: { fileName: asset.fileName, fileSize: asset.bytes },
              relationships: {
                appScreenshotSet: { data: { type: "appScreenshotSets", id: asset.setId } },
              },
            },
            { setId: asset.setId },
          )
        ).data,
        "appScreenshots",
      );
      check(!plan.old.some((e) => e.id === row.id) && !staged.some((e) => e.id === row.id));
      check(
        row.attributes?.fileName === asset.fileName &&
          row.attributes.fileSize === asset.bytes &&
          row.attributes.assetDeliveryState?.state === "AWAITING_UPLOAD",
      );
      check((await members(asset.setId)).some((r) => r.id === row.id));
      const parts = uploadParts(row.attributes.uploadOperations, asset.bytes);
      for (const part of parts) {
        check(
          Object.values(part.headers).every((value) =>
            [...issuedTokens].every((token) => !value.includes(token)),
          ),
        );
        receipt.operations.push({
          method: "PUT",
          id: row.id,
          offset: part.offset,
          length: part.length,
          outcome: "intent",
        });
        await persist();
        const response = await transport(part.url, {
          method: "PUT",
          redirect: "error",
          signal: globalThis.AbortSignal.timeout(30000),
          headers: part.headers,
          body: asset.data.subarray(part.offset, part.offset + part.length),
        });
        check(!response.redirected && [200, 201, 204].includes(response.status));
        await response.body?.cancel();
        receipt.operations.at(-1).outcome = "acknowledged";
        await persist();
      }
      await mutation(
        `/v1/appScreenshots/${row.id}`,
        "PATCH",
        {
          type: "appScreenshots",
          id: row.id,
          attributes: { uploaded: true, sourceFileChecksum: asset.md5 },
        },
        { id: row.id },
      );
      let complete = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        const current = resource(
            (await api(`/v1/appScreenshots/${row.id}`)).data,
            "appScreenshots",
            row.id,
          ),
          a = current.attributes;
        check(
          a?.fileName === asset.fileName &&
            a.fileSize === asset.bytes &&
            a.sourceFileChecksum === asset.md5,
        );
        const membership = await members(asset.setId);
        check(membership.some((r) => r.id === row.id));
        const state = a.assetDeliveryState?.state;
        check(["AWAITING_UPLOAD", "UPLOAD_COMPLETE", "COMPLETE"].includes(state));
        if (state === "COMPLETE") {
          check(a.imageAsset?.width === asset.width && a.imageAsset?.height === asset.height);
          complete = true;
          break;
        }
        if (attempt < 29) await pause();
      }
      check(complete);
      staged.push({ id: row.id, ...asset });
    }
    receipt.phase = "all-six-complete";
    await persist();
    await parents();
    // Recheck exact membership and original server checksums before every destructive operation.
    const deleted = new Set();
    for (const old of plan.old) {
      const current = await members(old.setId);
      const expected = [
        ...staged.filter((e) => e.setId === old.setId),
        ...plan.old.filter((e) => e.setId === old.setId && !deleted.has(e.id)),
      ];
      check(
        current.length === expected.length &&
          current.every((r) => expected.some((e) => e.id === r.id)),
      );
      for (const image of staged.filter((e) => e.setId === old.setId)) {
        const a = current.find((r) => r.id === image.id)?.attributes;
        check(
          a?.assetDeliveryState?.state === "COMPLETE" &&
            a.sourceFileChecksum === image.md5 &&
            a.fileSize === image.bytes &&
            a.fileName === image.fileName &&
            a.imageAsset?.width === image.width &&
            a.imageAsset?.height === image.height,
        );
      }
      oldMatches(
        old,
        current.find((r) => r.id === old.id),
      );
      await mutation(`/v1/appScreenshots/${old.id}`, "DELETE", undefined, { id: old.id });
      deleted.add(old.id);
    }
    for (const setId of Object.keys(SETS)) {
      const current = await members(setId),
        expected = staged.filter((e) => e.setId === setId);
      check(current.length === 3 && current.every((r, index) => r.id === expected[index].id));
    }
    receipt.phase = "complete";
    await persist();
    await journal.close();
    journal = undefined;
    return receipt;
  } catch {
    try {
      await journal?.close();
    } catch {
      /* The operation already failed; retain the generic unknown-outcome error. */
    }
    throw new Error("Screenshot operator stopped; read back state before retrying an apply");
  }
}

async function main() {
  const args = process.argv.slice(2),
    get = (name) => args[args.indexOf(name) + 1];
  check(
    args.every(
      (a, i) =>
        ["--plan", "--receipt", "--approved-sha256", "--apply"].includes(a) ||
        (i > 0 && ["--plan", "--receipt", "--approved-sha256"].includes(args[i - 1])),
    ),
  );
  check(args.filter((a) => a === "--plan").length === 1);
  const result = await screenshots(process.env, {
    planFile: get("--plan"),
    receiptFile: args.includes("--receipt") ? get("--receipt") : undefined,
    approvedSha256: args.includes("--approved-sha256") ? get("--approved-sha256") : undefined,
    apply: args.includes("--apply"),
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    process.stderr.write(
      "Screenshot operator stopped. If apply was requested, outcome may be unknown; inspect the durable receipt and read back before any retry. No automatic retry was performed.\n",
    );
    process.exitCode = 1;
  });
