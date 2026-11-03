// Exact-build TestFlight operator: read-only audit first; separately pinned apply.
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { open, readFile } from "node:fs/promises";
import { pathToFileURL, URL } from "node:url";
import { TextDecoder } from "node:util";
import { tokenFor } from "./mobile-store-status.mjs";

export const APP_ID = "6827324444";
export const BUILD_NUMBER = "62";
export const FEEDBACK_BUILD_NUMBER = "278";
export const VERSION = "1.0.0";
export const ORIGIN = "https://api.appstoreconnect.apple.com";
export const GROUPS = Object.freeze([
  Object.freeze({ name: "Dove Bevo owner testing", is_internal_group: true }),
  Object.freeze({ name: "Roberto feedback", is_internal_group: false }),
]);
const LIMIT = 256 * 1024;
// Five seven-GET inspections, three POSTs, three immediate read-backs, plus one
// complete seven-GET read-only reconciliation: at most 48 requests, no retries.
const MAX_REQUESTS = 48;
const id = (value) => typeof value === "string" && /^[A-Za-z0-9-]{1,100}$/.test(value);
const fail = () => {
  throw new Error("Beta distribution scope or response invalid");
};
const targetBuild = (number) => {
  if (number !== BUILD_NUMBER && number !== FEEDBACK_BUILD_NUMBER) fail();
  return number;
};
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const planBytes = (plan) => Buffer.from(JSON.stringify(plan, null, 2) + "\n");
const internalStates = new Set([
  "PROCESSING",
  "PROCESSING_EXCEPTION",
  "MISSING_EXPORT_COMPLIANCE",
  "READY_FOR_BETA_TESTING",
  "IN_BETA_TESTING",
  "EXPIRED",
  "IN_EXPORT_COMPLIANCE_REVIEW",
]);
const externalStates = new Set([
  ...internalStates,
  "READY_FOR_BETA_SUBMISSION",
  "WAITING_FOR_BETA_REVIEW",
  "IN_BETA_REVIEW",
  "BETA_REJECTED",
  "BETA_APPROVED",
  "NOT_APPLICABLE",
]);
const reviewStates = new Set(["WAITING_FOR_REVIEW", "IN_REVIEW", "REJECTED", "APPROVED"]);
const readyInternal = new Set(["READY_FOR_BETA_TESTING", "IN_BETA_TESTING"]);
const readyExternal = new Set([
  "READY_FOR_BETA_SUBMISSION",
  "WAITING_FOR_BETA_REVIEW",
  "IN_BETA_REVIEW",
  "BETA_APPROVED",
  "READY_FOR_BETA_TESTING",
  "IN_BETA_TESTING",
]);
const pendingExternal = new Set(["WAITING_FOR_BETA_REVIEW", "IN_BETA_REVIEW"]);
const approvedExternal = new Set(["BETA_APPROVED", "READY_FOR_BETA_TESTING", "IN_BETA_TESTING"]);
const acceptedReview = new Set(["WAITING_FOR_REVIEW", "IN_REVIEW", "APPROVED"]);

function reviewEstablished(snapshot, expectedSubmissionId) {
  return (
    pendingExternal.has(snapshot.external_state) ||
    approvedExternal.has(snapshot.external_state) ||
    snapshot.submissions.some(
      (submission) =>
        acceptedReview.has(submission.state) &&
        (!expectedSubmissionId || submission.id === expectedSubmissionId),
    )
  );
}

function exact(object, keys) {
  return (
    object &&
    typeof object === "object" &&
    !Array.isArray(object) &&
    Object.keys(object).sort().join() === [...keys].sort().join()
  );
}
function resource(value, type, expectedId) {
  if (!value || value.type !== type || !id(value.id) || (expectedId && value.id !== expectedId))
    fail();
  return value;
}
function relationship(value, field, type, expectedId) {
  return resource(value.relationships?.[field]?.data, type, expectedId);
}
function list(body, type, maximum) {
  if (
    !Array.isArray(body.data) ||
    body.data.length > maximum ||
    body.links?.next ||
    (body.meta?.paging?.total !== undefined && body.meta.paging.total !== body.data.length)
  )
    fail();
  const seen = new Set();
  for (const item of body.data) {
    resource(item, type);
    if (seen.has(item.id)) fail();
    seen.add(item.id);
  }
  return body.data;
}
function included(body, type, expectedId) {
  if (!Array.isArray(body.included) || body.included.length > 12) fail();
  const found = body.included.filter((row) => row.type === type && row.id === expectedId);
  if (found.length !== 1) fail();
  return resource(found[0], type, expectedId);
}
function groupShape(body) {
  const rows = Array.isArray(body.data) ? body.data : [];
  return {
    data_count: Array.isArray(body.data) ? Math.min(rows.length, 1001) : null,
    has_next: Boolean(body.links?.next),
    paging_total_matches:
      body.meta?.paging?.total === undefined ? null : body.meta.paging.total === rows.length,
    included_app_matches: Math.min(
      (Array.isArray(body.included) ? body.included : []).filter(
        (row) =>
          row?.type === "apps" &&
          row.id === APP_ID &&
          row.attributes?.bundleId === "com.dovebevo.app",
      ).length,
      3,
    ),
    known_groups: GROUPS.map((expected) => {
      const matches = rows.filter((row) => row?.attributes?.name === expected.name);
      const group = matches.length === 1 ? matches[0] : undefined;
      const parent = group?.relationships?.app?.data;
      const publicLink = group?.attributes?.publicLinkEnabled;
      return {
        matches: Math.min(matches.length, 3),
        resource_identity_valid: Boolean(group && group.type === "betaGroups" && id(group.id)),
        is_internal_group:
          typeof group?.attributes?.isInternalGroup === "boolean"
            ? group.attributes.isInternalGroup
            : null,
        parent:
          parent === undefined
            ? "MISSING"
            : parent?.type === "apps" && parent.id === APP_ID
              ? "MATCH"
              : "MISMATCH",
        public_link:
          publicLink === undefined
            ? "MISSING"
            : publicLink === null
              ? "NULL"
              : publicLink === false
                ? "DISABLED"
                : publicLink === true
                  ? "ENABLED"
                  : "INVALID",
      };
    }),
  };
}
function query(path, values) {
  const target = new URL(ORIGIN + path);
  for (const [key, value] of Object.entries(values)) target.searchParams.set(key, value);
  return target.pathname + target.search;
}
function clientFor(env, transport, diagnostics) {
  let calls = 0;
  return async (path, payload, expected = 200) => {
    const target = new URL(ORIGIN + path);
    if (
      ++calls > MAX_REQUESTS ||
      target.origin !== ORIGIN ||
      !path.startsWith("/v1/") ||
      path.includes("..") ||
      target.hash
    )
      fail();
    if (
      payload &&
      !(
        /^\/v1\/betaGroups\/[A-Za-z0-9-]+\/relationships\/builds$/.test(path) ||
        path === "/v1/betaAppReviewSubmissions"
      )
    )
      fail();
    if (diagnostics) {
      diagnostics.request_index = calls;
      diagnostics.http_status = null;
    }
    const response = await transport(target.href, {
      method: payload ? "POST" : "GET",
      redirect: "error",
      signal: globalThis.AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${tokenFor(env)}`,
        Accept: "application/json",
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    if (
      diagnostics &&
      Number.isInteger(response.status) &&
      response.status >= 100 &&
      response.status <= 599
    )
      diagnostics.http_status = response.status;
    if (
      response.status !== expected ||
      !response.ok ||
      response.redirected ||
      (response.url && response.url !== target.href)
    ) {
      await response.body?.cancel().catch(() => {});
      fail();
    }
    if (expected === 204) return null;
    if (!/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) fail();
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > LIMIT)) fail();
    const reader = response.body?.getReader();
    if (!reader) fail();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > LIMIT) fail();
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const body = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
    if (!body || typeof body !== "object" || Array.isArray(body) || body.errors || body.links?.next)
      fail();
    return body;
  };
}
const buildFields = {
  include: "app,preReleaseVersion,buildBetaDetail",
  "fields[builds]":
    "version,processingState,expired,expirationDate,app,preReleaseVersion,buildBetaDetail",
  "fields[apps]": "bundleId",
  "fields[preReleaseVersions]": "version,platform,app",
  "fields[buildBetaDetails]": "internalBuildState,externalBuildState,build",
};

async function membership(client, groupId, buildId) {
  const rows = list(
    await client(query(`/v1/betaGroups/${groupId}/relationships/builds`, { limit: "200" })),
    "builds",
    200,
  );
  return rows.some((row) => row.id === buildId);
}
async function submissions(client, buildId, buildNumber) {
  const body = await client(
    query("/v1/betaAppReviewSubmissions", {
      "filter[build]": buildId,
      include: "build",
      "fields[builds]": "version",
      "fields[betaAppReviewSubmissions]": "betaReviewState,build",
      limit: "2",
    }),
  );
  const rows = list(body, "betaAppReviewSubmissions", 1);
  return rows.map((row) => {
    relationship(row, "build", "builds", buildId);
    if (included(body, "builds", buildId).attributes?.version !== buildNumber) fail();
    if (!reviewStates.has(row.attributes?.betaReviewState)) fail();
    return { id: row.id, state: row.attributes.betaReviewState };
  });
}
async function inspect(client, plan, diagnostics, buildNumber) {
  const stage = (name) => {
    if (diagnostics) diagnostics.stage = name;
  };
  stage("BUILD_FETCH");
  const body = await client(
    plan
      ? query(`/v1/builds/${plan.build_id}`, buildFields)
      : query("/v1/builds", {
          ...buildFields,
          "filter[app]": APP_ID,
          "filter[version]": buildNumber,
          "filter[preReleaseVersion.version]": VERSION,
          "filter[preReleaseVersion.platform]": "IOS",
          limit: "2",
        }),
  );
  const rows = plan ? [body.data] : list(body, "builds", 1);
  if (rows.length !== 1) fail();
  stage("BUILD_IDENTITY");
  const build = resource(rows[0], "builds", plan?.build_id);
  relationship(build, "app", "apps", APP_ID);
  if (included(body, "apps", APP_ID).attributes?.bundleId !== "com.dovebevo.app") fail();
  stage("VERSION_IDENTITY");
  const versionId = relationship(build, "preReleaseVersion", "preReleaseVersions").id;
  const version = included(body, "preReleaseVersions", versionId);
  // Compound documents may omit nested linkage, but explicit contradictions fail.
  if (version.relationships?.app?.data !== undefined) relationship(version, "app", "apps", APP_ID);
  stage("VERSION_PARENT_FETCH");
  const versionParent = await client(`/v1/preReleaseVersions/${versionId}/relationships/app`);
  resource(versionParent.data, "apps", APP_ID);
  stage("VERSION_IDENTITY");
  if (version.attributes?.version !== VERSION || version.attributes?.platform !== "IOS") fail();
  stage("BUILD_STATE");
  const a = build.attributes;
  if (
    a?.version !== buildNumber ||
    !["PROCESSING", "FAILED", "INVALID", "VALID"].includes(a.processingState) ||
    typeof a.expired !== "boolean" ||
    typeof a.expirationDate !== "string" ||
    !Number.isFinite(Date.parse(a.expirationDate))
  )
    fail();
  stage("BETA_DETAIL");
  const betaId = relationship(build, "buildBetaDetail", "buildBetaDetails").id;
  const beta = included(body, "buildBetaDetails", betaId);
  if (beta.relationships?.build?.data !== undefined)
    relationship(beta, "build", "builds", build.id);
  stage("BETA_PARENT_FETCH");
  const betaParent = await client(`/v1/buildBetaDetails/${betaId}/relationships/build`);
  resource(betaParent.data, "builds", build.id);
  stage("BETA_DETAIL");
  if (
    !internalStates.has(beta.attributes?.internalBuildState) ||
    !externalStates.has(beta.attributes?.externalBuildState)
  )
    fail();
  stage("GROUPS_FETCH");
  const groupBody = await client(
    query("/v1/betaGroups", {
      "filter[app]": APP_ID,
      ...(plan ? { "filter[id]": plan.groups.map((g) => g.id).join(",") } : {}),
      include: "app",
      "fields[betaGroups]": "name,isInternalGroup,publicLinkEnabled,app",
      "fields[apps]": "bundleId",
      limit: "100",
    }),
  );
  stage("GROUP_IDENTITY");
  if (diagnostics) diagnostics.group_shape = groupShape(groupBody);
  const rawGroups = list(groupBody, "betaGroups", 100);
  if (
    rawGroups.length < 2 ||
    included(groupBody, "apps", APP_ID).attributes?.bundleId !== "com.dovebevo.app"
  )
    fail();
  for (const group of rawGroups) relationship(group, "app", "apps", APP_ID);
  if (diagnostics)
    diagnostics.app_groups = rawGroups.map((group) => ({
      id: group.id,
      name:
        typeof group.attributes?.name === "string" &&
        group.attributes.name.length <= 120 &&
        !/[\p{Cc}\p{Cs}]/u.test(group.attributes.name)
          ? group.attributes.name
          : null,
      is_internal_group:
        typeof group.attributes?.isInternalGroup === "boolean"
          ? group.attributes.isInternalGroup
          : null,
      public_link:
        group.attributes?.publicLinkEnabled === undefined
          ? "MISSING"
          : group.attributes.publicLinkEnabled === null
            ? "NULL"
            : group.attributes.publicLinkEnabled === false
              ? "DISABLED"
              : group.attributes.publicLinkEnabled === true
                ? "ENABLED"
                : "INVALID",
    }));
  const groups = [];
  for (const expected of GROUPS) {
    stage("GROUP_IDENTITY");
    const matches = rawGroups.filter((g) => g.attributes?.name === expected.name);
    if (matches.length !== 1) fail();
    const group = matches[0];
    relationship(group, "app", "apps", APP_ID);
    if (
      group.attributes.isInternalGroup !== expected.is_internal_group ||
      (plan && !plan.groups.some((g) => g.id === group.id && g.name === expected.name))
    )
      fail();
    const publicLink = group.attributes.publicLinkEnabled;
    if (
      publicLink !== undefined &&
      typeof publicLink !== "boolean" &&
      !(expected.is_internal_group && publicLink === null)
    )
      fail();
    stage("GROUP_MEMBERSHIP");
    groups.push({
      id: group.id,
      ...expected,
      public_link_enabled: publicLink ?? null,
      linked: await membership(client, group.id, build.id),
    });
  }
  stage("REVIEW_SUBMISSIONS");
  const reviewSubmissions = await submissions(client, build.id, buildNumber);
  return {
    build_id: build.id,
    processing_state: a.processingState,
    expired: a.expired,
    expiration_date: a.expirationDate,
    internal_state: beta.attributes.internalBuildState,
    external_state: beta.attributes.externalBuildState,
    groups,
    submissions: reviewSubmissions,
  };
}
function eligible(snapshot, now) {
  return (
    snapshot.processing_state === "VALID" &&
    !snapshot.expired &&
    Date.parse(snapshot.expiration_date) > now.getTime() &&
    readyInternal.has(snapshot.internal_state) &&
    readyExternal.has(snapshot.external_state) &&
    snapshot.groups.every((g) => g.is_internal_group || g.public_link_enabled === false) &&
    !snapshot.submissions.some((s) => s.state === "REJECTED")
  );
}
function proposal(snapshot, buildNumber) {
  return {
    schema_version: 1,
    app_id: APP_ID,
    build_id: snapshot.build_id,
    build_number: buildNumber,
    version: VERSION,
    groups: snapshot.groups.map(({ id, name, is_internal_group }) => ({
      id,
      name,
      is_internal_group,
    })),
    submit_beta_review_if_needed: true,
  };
}
export function validatePlan(bytes, approvedSha, buildNumber = BUILD_NUMBER) {
  targetBuild(buildNumber);
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength > 8192 ||
    !/^[a-f0-9]{64}$/.test(approvedSha ?? "") ||
    sha256(bytes) !== approvedSha
  )
    fail();
  const plan = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (
    !exact(plan, [
      "schema_version",
      "app_id",
      "build_id",
      "build_number",
      "version",
      "groups",
      "submit_beta_review_if_needed",
    ]) ||
    plan.schema_version !== 1 ||
    plan.app_id !== APP_ID ||
    plan.build_number !== buildNumber ||
    plan.version !== VERSION ||
    !id(plan.build_id) ||
    plan.submit_beta_review_if_needed !== true ||
    !Array.isArray(plan.groups) ||
    plan.groups.length !== 2 ||
    new Set(plan.groups.map((g) => g?.id)).size !== 2
  )
    fail();
  plan.groups.forEach((group, index) => {
    if (
      !exact(group, ["id", "name", "is_internal_group"]) ||
      !id(group.id) ||
      group.name !== GROUPS[index].name ||
      group.is_internal_group !== GROUPS[index].is_internal_group
    )
      fail();
  });
  if (!Buffer.from(bytes).equals(planBytes(plan))) fail();
  return plan;
}
function base(mode, now, buildNumber) {
  return {
    schema_version: 1,
    app_id: APP_ID,
    build_number: buildNumber,
    version: VERSION,
    mode,
    checked_at: now().toISOString(),
    complete: false,
    actions: [],
  };
}

export async function auditBetaDistribution(
  env,
  { transport = globalThis.fetch, now = () => new Date(), buildNumber = BUILD_NUMBER } = {},
) {
  targetBuild(buildNumber);
  const receipt = base("audit", now, buildNumber);
  const diagnostics = { stage: "BUILD_FETCH", request_index: 0, http_status: null };
  try {
    receipt.before = await inspect(
      clientFor(env, transport, diagnostics),
      undefined,
      diagnostics,
      buildNumber,
    );
    receipt.ready = eligible(receipt.before, now());
    if (receipt.ready) {
      receipt.plan = proposal(receipt.before, buildNumber);
      receipt.plan_sha256 = sha256(planBytes(receipt.plan));
    }
    receipt.complete = true;
  } catch {
    receipt.error = "BETA_AUDIT_UNAVAILABLE_OR_INVALID";
    receipt.failure = diagnostics;
  }
  return receipt;
}

export async function applyBetaDistribution(
  env,
  {
    bytes,
    approvedSha,
    checkpoint,
    transport = globalThis.fetch,
    now = () => new Date(),
    buildNumber = BUILD_NUMBER,
  } = {},
) {
  // These local guards precede credential access and every API call.
  const plan = validatePlan(bytes, approvedSha, buildNumber);
  if (typeof checkpoint !== "function") fail();
  const receipt = {
    ...base("apply", now, buildNumber),
    plan_sha256: approvedSha,
    build_id: plan.build_id,
  };
  const client = clientFor(env, transport);
  async function fresh() {
    const current = await inspect(client, plan, undefined, buildNumber);
    if (!eligible(current, now())) fail();
    return current;
  }
  async function mutate(kind, groupId, path, payload, expected, readBack) {
    const action = {
      kind,
      build_id: plan.build_id,
      ...(groupId ? { group_id: groupId } : {}),
      outcome: "indeterminate",
    };
    receipt.actions.push(action);
    await checkpoint(receipt); // durable uncertainty is recorded before dispatch, never after only.
    const response = await client(path, payload, expected);
    await readBack(response);
    action.outcome = "confirmed_by_read_back";
    await checkpoint(receipt);
  }
  try {
    receipt.before = await fresh();
    await checkpoint(receipt);
    for (const group of plan.groups) {
      const current = await fresh();
      if (current.groups.find((g) => g.id === group.id)?.linked) continue;
      await mutate(
        "associate_existing_group",
        group.id,
        `/v1/betaGroups/${group.id}/relationships/builds`,
        { data: [{ type: "builds", id: plan.build_id }] },
        204,
        async () => {
          if (!(await membership(client, group.id, plan.build_id))) fail();
        },
      );
    }
    const current = await fresh();
    if (!current.groups.every((g) => g.linked)) fail();
    const existingSubmission = current.submissions.find((s) => acceptedReview.has(s.state));
    if (existingSubmission) receipt.beta_review_submission_id = existingSubmission.id;
    const pending =
      current.submissions.some((s) => ["WAITING_FOR_REVIEW", "IN_REVIEW"].includes(s.state)) ||
      pendingExternal.has(current.external_state);
    const approved =
      current.submissions.some((s) => s.state === "APPROVED") ||
      approvedExternal.has(current.external_state);
    if (!pending && !approved) {
      if (
        current.external_state !== "READY_FOR_BETA_SUBMISSION" ||
        current.submissions.length !== 0
      )
        fail();
      await mutate(
        "submit_exact_build_for_beta_review",
        null,
        "/v1/betaAppReviewSubmissions",
        {
          data: {
            type: "betaAppReviewSubmissions",
            relationships: { build: { data: { type: "builds", id: plan.build_id } } },
          },
        },
        201,
        async (body) => {
          const submitted = resource(body?.data, "betaAppReviewSubmissions");
          receipt.beta_review_submission_id = submitted.id;
          const rows = await submissions(client, plan.build_id, buildNumber);
          if (!rows.some((s) => s.id === submitted.id && acceptedReview.has(s.state))) fail();
        },
      );
    }
    receipt.after = await inspect(client, plan, undefined, buildNumber);
    if (
      !eligible(receipt.after, now()) ||
      !receipt.after.groups.every((g) => g.linked) ||
      !reviewEstablished(receipt.after, receipt.beta_review_submission_id)
    )
      fail();
    receipt.complete = true;
    receipt.owner_in_beta_testing = receipt.after.internal_state === "IN_BETA_TESTING";
    receipt.roberto_in_beta_testing = receipt.after.external_state === "IN_BETA_TESTING";
    await checkpoint(receipt);
  } catch {
    receipt.complete = false;
    receipt.error = "BETA_APPLY_FAILED_READ_BACK_BEFORE_ANY_RETRY";
    // One read-only reconciliation attempt; never repeat a POST or continue mutating.
    try {
      receipt.after = await inspect(client, plan, undefined, buildNumber);
    } catch {
      receipt.read_back = "UNAVAILABLE";
    }
    await checkpoint(receipt);
  }
  return receipt;
}

async function main(args) {
  const feedbackBuild =
    args.length >= 3 && args.at(-2) === "--build-number" && args.at(-1) === FEEDBACK_BUILD_NUMBER;
  const buildNumber = feedbackBuild ? FEEDBACK_BUILD_NUMBER : BUILD_NUMBER;
  if (feedbackBuild) args = args.slice(0, -2);
  if (!args[0] || args[0].startsWith("-") || ![1, 3, 6].includes(args.length)) fail();
  const applying =
    args.length === 6 &&
    args[1] === "--apply" &&
    args[2] === "--plan" &&
    args[4] === "--approved-plan-sha";
  if ((args.length === 6 && !applying) || (args.length === 3 && args[1] !== "--plan-output"))
    fail();
  const bytes = applying ? await readFile(args[3]) : undefined;
  if (applying) validatePlan(bytes, args[5], buildNumber);
  const output = await open(args[0], "wx", 0o600);
  const checkpoint = async (receipt) => {
    const content = Buffer.from(JSON.stringify(receipt, null, 2) + "\n");
    let offset = 0;
    while (offset < content.length) {
      const { bytesWritten } = await output.write(content, offset, content.length - offset, offset);
      if (bytesWritten < 1) fail();
      offset += bytesWritten;
    }
    await output.truncate(content.length);
    await output.sync();
  };
  try {
    const receipt = applying
      ? await applyBetaDistribution(process.env, {
          bytes,
          approvedSha: args[5],
          checkpoint,
          buildNumber,
        })
      : await auditBetaDistribution(process.env, { buildNumber });
    await checkpoint(receipt);
    if (!applying && args.length === 3 && receipt.plan) {
      const plan = await open(args[2], "wx", 0o600);
      try {
        await plan.writeFile(planBytes(receipt.plan));
        await plan.sync();
      } finally {
        await plan.close();
      }
    }
    process.stdout.write(
      JSON.stringify({
        complete: receipt.complete,
        mode: receipt.mode,
        ready: receipt.ready ?? null,
        app_id: APP_ID,
        build_number: buildNumber,
      }) + "\n",
    );
    if (!receipt.complete || (!applying && !receipt.ready)) process.exitCode = 1;
  } finally {
    await output.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(() => {
    process.stderr.write(
      "Beta operation failed; preserve its receipt and audit exact state before any retry\n",
    );
    process.exitCode = 1;
  });
}
