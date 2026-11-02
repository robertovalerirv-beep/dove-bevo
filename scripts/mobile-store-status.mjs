// Read-only store state using the existing protected release credential.
import { createPrivateKey, sign } from "node:crypto";
import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const APP = "6827324444";
const ORIGIN = "https://api.appstoreconnect.apple.com";
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

export function tokenFor(env, now = Math.floor(Date.now() / 1000)) {
  const keyId = env.DOVEBEVO_ASC_KEY_ID;
  const issuer = env.DOVEBEVO_ASC_ISSUER_ID;
  if (!/^[A-Z0-9]{10}$/.test(keyId ?? "") || !/^[a-f0-9-]{36}$/i.test(issuer ?? "")) {
    throw new Error("Missing release authentication configuration");
  }
  const key = createPrivateKey(env.DOVEBEVO_ASC_PRIVATE_KEY ?? "");
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw new Error("Unexpected release signing algorithm");
  }
  const payload = `${encode({ alg: "ES256", kid: keyId, typ: "JWT" })}.${encode({ iss: issuer, iat: now - 5, exp: now + 180, aud: "appstoreconnect-v1" })}`;
  return `${payload}.${sign("sha256", Buffer.from(payload), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}

export const requests = Object.freeze([
  `/v1/apps/${APP}/appStoreVersions?limit=10&include=build&fields[appStoreVersions]=platform,versionString,appStoreState,appVersionState,releaseType,downloadable,build&fields[builds]=version,processingState,expired`,
  `/v1/builds?filter[app]=${APP}&sort=-uploadedDate&limit=10&include=buildBetaDetail&fields[builds]=version,processingState,uploadedDate,expired,buildBetaDetail&fields[buildBetaDetails]=internalBuildState,externalBuildState`,
]);
const allowed = {
  appStoreVersions: [
    "platform",
    "versionString",
    "appStoreState",
    "appVersionState",
    "releaseType",
    "downloadable",
  ],
  builds: ["version", "processingState", "uploadedDate", "expired"],
  buildBetaDetails: ["internalBuildState", "externalBuildState"],
};

export function publicState(body) {
  if (
    !body ||
    !Array.isArray(body.data) ||
    body.data.length > 10 ||
    (body.included !== undefined && (!Array.isArray(body.included) || body.included.length > 30))
  ) {
    throw new Error("Unexpected store response");
  }
  return [...body.data, ...(body.included ?? [])].map((row) => {
    if (
      !row ||
      !allowed[row.type] ||
      !/^[A-Za-z0-9-]{1,100}$/.test(row.id ?? "") ||
      !row.attributes ||
      typeof row.attributes !== "object"
    )
      throw new Error("Unexpected store resource");
    const attributes = {};
    for (const field of allowed[row.type]) {
      const value = row.attributes[field];
      if (
        typeof value === "string" &&
        value.length <= 100 &&
        ![...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
      )
        attributes[field] = value;
      if (typeof value === "boolean") attributes[field] = value;
    }
    const relationships = {};
    for (const name of ["build", "buildBetaDetail"]) {
      const related = row.relationships?.[name]?.data;
      if (related && allowed[related.type] && /^[A-Za-z0-9-]{1,100}$/.test(related.id ?? "")) {
        relationships[name] = { type: related.type, id: related.id };
      }
    }
    return { type: row.type, id: row.id, attributes, relationships };
  });
}

export async function collectStatus(env, transport = globalThis.fetch) {
  const token = tokenFor(env);
  const result = {
    schema_version: 1,
    app_id: APP,
    checked_at: new Date().toISOString(),
    complete: true,
    snapshots: [],
  };
  for (const path of requests) {
    // Fixed origin/path, GET only, no redirects or response/error-body logging.
    try {
      const response = await transport(ORIGIN + path, {
        method: "GET",
        redirect: "error",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: globalThis.AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        result.complete = false;
        result.snapshots.push({ http_status: response.status, resources: [] });
        continue;
      }
      const reader = response.body.getReader();
      const chunks = [];
      let count = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          count += value.byteLength;
          if (count > 256 * 1024) throw new Error("Store response limit");
          chunks.push(Buffer.from(value));
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      result.snapshots.push({
        http_status: response.status,
        resources: publicState(JSON.parse(Buffer.concat(chunks).toString("utf8"))),
      });
    } catch {
      result.complete = false;
      result.snapshots.push({ error: "store_read_failed", resources: [] });
    }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error("Expected output file");
    const status = await collectStatus(process.env);
    await writeFile(process.argv[2], JSON.stringify(status, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    process.stdout.write(JSON.stringify({ complete: status.complete, app_id: APP }) + "\n");
    if (!status.complete) process.exitCode = 2;
  } catch {
    process.stderr.write("Read-only store status unavailable\n");
    process.exitCode = 2;
  }
}
