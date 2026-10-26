// CI-only readback: no resource creation, deployment, migration, secret read or write.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const PREVIEW_NAME = "dovebevo-mobile-preview";
const PREVIEW_HOST = "mobile-preview.dovebevo.com";
const WIDGET_NAME = "Dove bevo mobile preview";
const MAX_BYTES = 262144;
const MAX_PAGES = 3;
const PAGE_SIZE = 100;
const TAG = /^[a-f0-9]{32}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const check = (status, code) => ({ status, code });

class ReadFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// The only network boundary. Callers supply fixed endpoint families and validated identifiers.
async function readApi(fetchImpl, token, path) {
  const controller = new globalThis.AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ReadFailure(
        response.status === 401 || response.status === 403
          ? "READ_ACCESS_DENIED"
          : "HTTP_READ_FAILED",
      );
    }
    if (Number(response.headers.get("content-length")) > MAX_BYTES) {
      await response.body?.cancel();
      throw new ReadFailure("RESPONSE_TOO_LARGE");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new ReadFailure("INVALID_API_RESPONSE");
    const decoder = new globalThis.TextDecoder();
    let size = 0;
    let text = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) {
          await reader.cancel();
          throw new ReadFailure("RESPONSE_TOO_LARGE");
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new ReadFailure("INVALID_API_RESPONSE");
    }
    if (!object(body) || body.success !== true) throw new ReadFailure("API_READ_REJECTED");
    return body;
  } catch (error) {
    if (error instanceof ReadFailure) throw error;
    throw new ReadFailure(controller.signal.aborted ? "READ_TIMEOUT" : "NETWORK_READ_FAILED");
  } finally {
    globalThis.clearTimeout(timer);
  }
}

// Absence is only established by a complete list, never by a 404 or a partial page.
async function readList(read, path, paginated = true) {
  const results = [];
  let expectedTotal;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const separator = path.includes("?") ? "&" : "?";
    const body = await read(
      paginated ? `${path}${separator}page=${page}&per_page=${PAGE_SIZE}` : path,
    );
    if (!Array.isArray(body.result) || !body.result.every(object)) {
      throw new ReadFailure("INVALID_API_RESPONSE");
    }
    results.push(...body.result);
    const info = body.result_info;
    // Workers scripts has no pagination contract; retain its existing metadata checks.
    if (!paginated && info === undefined) return results;
    if (
      !object(info) ||
      info.page !== page ||
      !Number.isSafeInteger(info.total_count) ||
      info.total_count < 0 ||
      !Number.isSafeInteger(info.per_page) ||
      info.per_page < 1 ||
      !Number.isSafeInteger(info.count) ||
      info.count !== body.result.length ||
      body.result.length > info.per_page ||
      (expectedTotal !== undefined && expectedTotal !== info.total_count)
    )
      throw new ReadFailure("PAGINATION_INCOMPLETE");
    expectedTotal = info.total_count;
    if (results.length === expectedTotal) return results;
    if (!paginated || results.length > expectedTotal || body.result.length !== info.per_page) {
      throw new ReadFailure("PAGINATION_INCOMPLETE");
    }
  }
  throw new ReadFailure("PAGINATION_INCOMPLETE");
}

async function readWorkerDomains(read, path) {
  // Cloudflare's official client uses SinglePage for this endpoint, with no next page.
  // result_info fields are optional; total_count may include domains outside the filter.
  const body = await read(path);
  if (!Array.isArray(body.result) || !body.result.every(object)) {
    throw new ReadFailure("INVALID_API_RESPONSE");
  }
  const info = body.result_info;
  if (
    info !== undefined &&
    (!object(info) ||
      ["count", "page", "per_page", "total_count", "total_pages"].some(
        (field) => field in info && (!Number.isSafeInteger(info[field]) || info[field] < 0),
      ))
  )
    throw new ReadFailure("INVALID_API_RESPONSE");
  return body.result;
}

function sourceConfig(configText) {
  const { config, error } = ts.parseConfigFileTextToJson("wrangler.jsonc", configText);
  const staging = config?.env?.staging;
  const bindings = staging?.d1_databases;
  const databases = Array.isArray(bindings) ? bindings.filter((db) => db?.binding === "DB") : [];
  const db = databases[0];
  if (
    error ||
    staging?.name !== "dovebevo-staging" ||
    databases.length !== 1 ||
    db?.database_name !== "dovebevo-staging" ||
    typeof db.database_id !== "string" ||
    !UUID.test(db.database_id)
  )
    throw new ReadFailure("TRACKED_SOURCE_CONFIG_INVALID");
  return { worker: staging.name, database: db.database_id, databaseName: db.database_name };
}

export async function runPreflight({ configText, env, fetchImpl = globalThis.fetch }) {
  const report = {
    readiness: "FAIL",
    targetAccountMatchesExpectedSource: "UNKNOWN",
    checks: Object.fromEntries(
      [
        "credentials",
        "trackedSourceConfig",
        "sourceWorker",
        "sourceDatabase",
        "zone",
        "workerNameAvailable",
        "databaseNameAvailable",
        "customDomainAvailable",
        "dnsNameAvailable",
        "turnstileWidgetNameAvailable",
      ].map((name) => [name, check("UNKNOWN", "NOT_CHECKED")]),
    ),
    // Read access cannot establish write permissions, free capacity, or permission to provision.
    capabilities: {
      workerCreate: "UNKNOWN",
      d1Write: "UNKNOWN",
      turnstileWrite: "UNKNOWN",
      customDomainWrite: "UNKNOWN",
      freeResourceCapacity: "UNKNOWN",
    },
    provisioningAuthorized: false,
  };
  const record = async (name, fn) => {
    try {
      const value = await fn();
      report.checks[name] = check("PASS", "READ_CHECK_PASSED");
      return value;
    } catch (error) {
      report.checks[name] = check(
        "UNKNOWN",
        error instanceof ReadFailure ? error.code : "READ_CHECK_FAILED",
      );
      return undefined;
    }
  };
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CLOUDFLARE_API_TOKEN;
  if (
    typeof account !== "string" ||
    !TAG.test(account) ||
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > 4096 ||
    /[\r\n]/.test(token)
  ) {
    report.checks.credentials = check("FAIL", "CI_CREDENTIALS_MISSING_OR_INVALID");
    return report;
  }
  report.checks.credentials = check("PASS", "CI_CREDENTIALS_PRESENT");
  const source = await record("trackedSourceConfig", () => sourceConfig(configText));
  if (!source) return report;
  const read = (path) => readApi(fetchImpl, token, path);
  const prefix = `/accounts/${account}`;
  const worker = await record("sourceWorker", () =>
    read(`${prefix}/workers/scripts/${source.worker}/settings`),
  );
  if (!worker) return report;
  const bindings = worker.result?.bindings;
  const dbBindings = Array.isArray(bindings)
    ? bindings.filter((binding) => binding?.name === "DB")
    : [];
  if (
    dbBindings.length !== 1 ||
    dbBindings[0]?.type !== "d1" ||
    dbBindings[0]?.id !== source.database
  ) {
    report.checks.sourceWorker = check("FAIL", "SOURCE_BINDING_MISMATCH");
    report.targetAccountMatchesExpectedSource = "FAIL";
    return report;
  }
  const database = await record("sourceDatabase", () =>
    read(`${prefix}/d1/database/${source.database}`),
  );
  if (!database) return report;
  if (database.result?.name !== source.databaseName || database.result?.uuid !== source.database) {
    report.checks.sourceDatabase = check("FAIL", "SOURCE_DATABASE_MISMATCH");
    report.targetAccountMatchesExpectedSource = "FAIL";
    return report;
  }
  report.targetAccountMatchesExpectedSource = "PASS";

  const zones = await record("zone", () =>
    readList(read, `/zones?name=dovebevo.com&account.id=${account}`),
  );
  const zone = zones?.[0];
  if (
    zones &&
    (zones.length !== 1 ||
      zone.name !== "dovebevo.com" ||
      zone.status !== "active" ||
      zone.account?.id !== account ||
      typeof zone.id !== "string" ||
      !TAG.test(zone.id))
  ) {
    report.checks.zone = check("FAIL", "EXPECTED_ACTIVE_ZONE_NOT_UNIQUE");
  }
  const available = async (name, path, field, expected, list = readList) => {
    const rows = await record(name, () => list(read, path));
    if (!rows) return;
    if (rows.some((row) => typeof row[field] !== "string")) {
      report.checks[name] = check("UNKNOWN", "INVALID_API_RESPONSE");
    } else if (rows.some((row) => row[field].toLowerCase() === expected.toLowerCase())) {
      report.checks[name] = check("FAIL", "PLANNED_RESOURCE_OCCUPIED");
    }
  };
  await available(
    "workerNameAvailable",
    `${prefix}/workers/scripts`,
    "id",
    PREVIEW_NAME,
    (read, path) => readList(read, path, false),
  );
  await available(
    "databaseNameAvailable",
    `${prefix}/d1/database?name=${PREVIEW_NAME}`,
    "name",
    PREVIEW_NAME,
  );
  await available(
    "customDomainAvailable",
    `${prefix}/workers/domains?hostname=${PREVIEW_HOST}`,
    "hostname",
    PREVIEW_HOST,
    readWorkerDomains,
  );
  if (report.checks.zone.status === "PASS") {
    await available(
      "dnsNameAvailable",
      `/zones/${zone.id}/dns_records?name.exact=${PREVIEW_HOST}`,
      "name",
      PREVIEW_HOST,
    );
  }
  // The list endpoint is metadata only. Never request a widget detail/secret endpoint.
  await available(
    "turnstileWidgetNameAvailable",
    `${prefix}/challenges/widgets?filter=name:${encodeURIComponent(WIDGET_NAME)}`,
    "name",
    WIDGET_NAME,
  );
  if (Object.values(report.checks).every((entry) => entry.status === "PASS"))
    report.readiness = "PASS";
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const report = await runPreflight({
      configText: readFileSync(new globalThis.URL("../wrangler.jsonc", import.meta.url), "utf8"),
      env: process.env,
    });
    console.log(JSON.stringify(report));
    process.exitCode = report.readiness === "PASS" ? 0 : 1;
  } catch {
    // Neither exception strings nor API payloads are safe public CI output.
    console.log(JSON.stringify({ readiness: "FAIL", code: "PREFLIGHT_INPUT_UNAVAILABLE" }));
    process.exitCode = 1;
  }
}
