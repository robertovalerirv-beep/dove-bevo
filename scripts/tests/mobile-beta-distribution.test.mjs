import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import {
  APP_ID,
  BUILD_NUMBER,
  FEEDBACK_BUILD_NUMBER,
  VERSION,
  GROUPS,
  ORIGIN,
  applyBetaDistribution,
  auditBetaDistribution,
  planBytes,
  sha256,
  validatePlan,
} from "../mobile-beta-distribution.mjs";

const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const env = {
  DOVEBEVO_ASC_KEY_ID: "ABCDEFGHIJ",
  DOVEBEVO_ASC_ISSUER_ID: "00000000-0000-4000-8000-000000000000",
  DOVEBEVO_ASC_PRIVATE_KEY: pair.privateKey.export({ type: "pkcs8", format: "pem" }),
};
const now = () => new Date("2026-11-02T12:00:00Z");
const clone = (value) => JSON.parse(JSON.stringify(value));
const rel = (type, id) => ({ data: { type, id } });
const resource = (type, id, attributes = {}, relationships = {}) => ({
  type,
  id,
  attributes,
  relationships,
});
const json = (body, status = 200) =>
  new globalThis.Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function fixture(overrides = {}) {
  const state = {
    app: APP_ID,
    buildId: "build-62",
    number: BUILD_NUMBER,
    targetNumber: BUILD_NUMBER,
    version: VERSION,
    platform: "IOS",
    processing: "VALID",
    expired: false,
    expires: "2027-01-20T00:00:00Z",
    internal: "READY_FOR_BETA_TESTING",
    external: "READY_FOR_BETA_SUBMISSION",
    groups: GROUPS.map((g, i) => ({
      id: i ? "roberto-group" : "owner-group",
      ...g,
      publicLink: false,
      app: APP_ID,
    })),
    linked: new Set(),
    submission: null,
    ...overrides,
  };
  const calls = [],
    checkpoints = [];
  const app = () =>
    resource("apps", APP_ID, {
      bundleId: "com.dovebevo.app",
      privateEmail: "private@example.test",
    });
  const build = () =>
    resource(
      "builds",
      state.buildId,
      {
        version: state.number,
        processingState: state.processing,
        expired: state.expired,
        expirationDate: state.expires,
        existingPrivateNotes: "PRIVATE-NOTES-DO-NOT-LOG",
      },
      {
        app: rel("apps", state.app),
        preReleaseVersion: rel("preReleaseVersions", "version-1"),
        buildBetaDetail: rel("buildBetaDetails", "detail-62"),
      },
    );
  const included = () => [
    app(),
    resource(
      "preReleaseVersions",
      "version-1",
      { version: state.version, platform: state.platform },
      state.omitNestedVersionApp ? {} : { app: rel("apps", state.versionApp ?? APP_ID) },
    ),
    resource(
      "buildBetaDetails",
      "detail-62",
      { internalBuildState: state.internal, externalBuildState: state.external },
      state.omitNestedBetaBuild ? {} : { build: rel("builds", state.detailBuild ?? state.buildId) },
    ),
  ];
  const transport = async (url, options) => {
    const target = new URL(url);
    assert.equal(target.origin, ORIGIN);
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof globalThis.AbortSignal);
    assert.match(options.headers.Authorization, /^Bearer /);
    const call = {
      path: target.pathname,
      query: target.searchParams,
      method: options.method,
      body: options.body ? JSON.parse(options.body) : undefined,
    };
    calls.push(call);
    const intercepted = await state.intercept?.(call, state);
    if (intercepted) return intercepted;
    if (call.method === "GET") {
      if (call.path === "/v1/builds") {
        assert.equal(call.query.get("filter[app]"), APP_ID);
        assert.equal(call.query.get("filter[version]"), state.targetNumber);
        assert.equal(call.query.get("filter[preReleaseVersion.version]"), "1.0.0");
        assert.equal(call.query.get("filter[preReleaseVersion.platform]"), "IOS");
        return json({ data: state.noBuild ? [] : [build()], included: included() });
      }
      if (call.path === `/v1/builds/${state.buildId}`)
        return json({ data: build(), included: included() });
      if (call.path === "/v1/preReleaseVersions/version-1/relationships/app")
        return json({ data: { type: "apps", id: state.versionAppLink ?? APP_ID } });
      if (call.path === "/v1/buildBetaDetails/detail-62/relationships/build")
        return json({ data: { type: "builds", id: state.betaBuildLink ?? state.buildId } });
      if (call.path === "/v1/betaGroups") {
        assert.equal(call.query.get("filter[app]"), APP_ID);
        assert.equal(call.query.has("filter[name]"), false);
        assert.equal(call.query.get("limit"), "100");
        return json({
          data: state.groups.map((g) =>
            resource(
              "betaGroups",
              g.id,
              {
                name: g.name,
                isInternalGroup: g.is_internal_group,
                ...(g.publicLink === undefined ? {} : { publicLinkEnabled: g.publicLink }),
                testerEmail: "tester@example.test",
              },
              { app: rel("apps", g.app) },
            ),
          ),
          included: [app()],
        });
      }
      const membership = /^\/v1\/betaGroups\/([^/]+)\/relationships\/builds$/.exec(call.path);
      if (membership)
        return json({
          data: state.linked.has(membership[1]) ? [{ type: "builds", id: state.buildId }] : [],
        });
      if (call.path === "/v1/betaAppReviewSubmissions") {
        assert.equal(call.query.get("filter[build]"), state.buildId);
        return json({
          data: state.submission
            ? [
                resource(
                  "betaAppReviewSubmissions",
                  state.submission.id,
                  { betaReviewState: state.submission.state },
                  { build: rel("builds", state.submission.build ?? state.buildId) },
                ),
              ]
            : [],
          included: [build()],
        });
      }
    } else if (call.method === "POST") {
      const membership = /^\/v1\/betaGroups\/([^/]+)\/relationships\/builds$/.exec(call.path);
      if (membership) {
        assert.deepEqual(call.body, { data: [{ type: "builds", id: state.buildId }] });
        assert.equal(checkpoints.at(-1).actions.at(-1).outcome, "indeterminate");
        assert.ok(state.groups.some((g) => g.id === membership[1]));
        state.linked.add(membership[1]);
        return new globalThis.Response(null, { status: 204 });
      }
      if (call.path === "/v1/betaAppReviewSubmissions") {
        assert.deepEqual(call.body, {
          data: {
            type: "betaAppReviewSubmissions",
            relationships: { build: rel("builds", state.buildId) },
          },
        });
        assert.equal(checkpoints.at(-1).actions.at(-1).outcome, "indeterminate");
        assert.equal(state.submission, null);
        state.submission = { id: `submission-${state.targetNumber}`, state: "WAITING_FOR_REVIEW" };
        state.external = "WAITING_FOR_BETA_REVIEW";
        return json({ data: resource("betaAppReviewSubmissions", state.submission.id) }, 201);
      }
    }
    assert.fail(`Unexpected fixture request ${call.method} ${call.path}`);
  };
  const checkpoint = async (receipt) => {
    checkpoints.push(clone(receipt));
  };
  const audit = () =>
    auditBetaDistribution(env, { transport, now, buildNumber: state.targetNumber });
  const apply = (plan) => {
    const bytes = planBytes(plan);
    return applyBetaDistribution(env, {
      transport,
      now,
      checkpoint,
      bytes,
      approvedSha: sha256(bytes),
      buildNumber: state.targetNumber,
    });
  };
  return { state, calls, checkpoints, transport, checkpoint, audit, apply };
}

test("audit is GET-only, pins the exact build/groups and discards private fields", async () => {
  const f = fixture();
  const receipt = await f.audit();
  assert.equal(receipt.complete, true);
  assert.equal(receipt.ready, true);
  assert.equal(receipt.plan.build_id, "build-62");
  assert.equal(receipt.plan.groups[0].id, "owner-group");
  assert.equal(receipt.plan.groups[1].id, "roberto-group");
  assert.equal(receipt.plan_sha256, sha256(planBytes(receipt.plan)));
  assert.equal(validatePlan(planBytes(receipt.plan), receipt.plan_sha256).app_id, APP_ID);
  assert.ok(f.calls.every((c) => c.method === "GET"));
  assert.ok(!JSON.stringify(receipt).includes("@"));
  for (const prohibited of [
    "PRIVATE-NOTES",
    "BEGIN PRIVATE KEY",
    "Bearer",
    "individualTesters",
    "betaTesters",
    "appStoreVersions",
    "betaAppReviewDetails",
  ]) {
    assert.ok(!JSON.stringify(receipt).includes(prohibited));
    assert.ok(
      !f.calls.some((c) => c.path.includes(prohibited) || c.query.toString().includes(prohibited)),
    );
  }
});

test("feedback build 271 is exact and rejects the historical build 62 plan before credentials", async () => {
  const old = fixture();
  const oldReceipt = await old.audit();
  const oldBytes = planBytes(oldReceipt.plan);
  const oldHash = sha256(oldBytes);
  assert.throws(() => validatePlan(oldBytes, oldHash, FEEDBACK_BUILD_NUMBER));
  let called = false;
  await assert.rejects(
    applyBetaDistribution(
      {},
      {
        bytes: oldBytes,
        approvedSha: oldHash,
        buildNumber: FEEDBACK_BUILD_NUMBER,
        checkpoint: async () => {
          called = true;
        },
        transport: async () => {
          called = true;
          assert.fail("no provider call for stale plan");
        },
      },
    ),
  );
  assert.equal(called, false);

  const f = fixture({
    buildId: "build-271",
    number: FEEDBACK_BUILD_NUMBER,
    targetNumber: FEEDBACK_BUILD_NUMBER,
  });
  const audited = await f.audit();
  assert.equal(audited.complete, true);
  assert.equal(audited.ready, true);
  assert.equal(audited.build_number, FEEDBACK_BUILD_NUMBER);
  assert.equal(audited.plan.build_id, "build-271");
  assert.equal(audited.plan.build_number, FEEDBACK_BUILD_NUMBER);
  assert.deepEqual(
    audited.plan.groups.map((g) => g.name),
    GROUPS.map((g) => g.name),
  );
  assert.ok(f.calls.every((call) => call.method === "GET"));
  const bytes = planBytes(audited.plan);
  assert.equal(validatePlan(bytes, sha256(bytes), FEEDBACK_BUILD_NUMBER).build_id, "build-271");
  assert.throws(() => validatePlan(bytes, sha256(bytes)));
  const applied = await f.apply(audited.plan);
  assert.equal(applied.complete, true);
  assert.deepEqual(
    f.calls.filter((call) => call.method === "POST").map((call) => call.path),
    [
      "/v1/betaGroups/owner-group/relationships/builds",
      "/v1/betaGroups/roberto-group/relationships/builds",
      "/v1/betaAppReviewSubmissions",
    ],
  );
  assert.equal(applied.after.build_id, "build-271");

  const wrongNumber = fixture({
    buildId: "build-271",
    number: BUILD_NUMBER,
    targetNumber: FEEDBACK_BUILD_NUMBER,
  });
  assert.equal((await wrongNumber.audit()).complete, false);
  assert.ok(wrongNumber.calls.every((call) => call.method === "GET"));
  const publicGroup = fixture({
    buildId: "build-271",
    number: FEEDBACK_BUILD_NUMBER,
    targetNumber: FEEDBACK_BUILD_NUMBER,
    groups: f.state.groups.map((group) => ({
      ...group,
      publicLink: group.is_internal_group ? null : true,
    })),
  });
  assert.equal((await publicGroup.audit()).ready, false);
  assert.ok(publicGroup.calls.every((call) => call.method === "GET"));
});

test("no uploaded exact build yields no plan or mutation", async () => {
  const f = fixture({ noBuild: true });
  const receipt = await f.audit();
  assert.equal(receipt.complete, false);
  assert.equal(receipt.plan, undefined);
  assert.ok(f.calls.every((c) => c.method === "GET"));
});

test("failure diagnostics expose only a fixed stage, numeric status and bounded request index", async () => {
  for (const [overrides, expected] of [
    [{ app: "private-wrong-app" }, { stage: "BUILD_IDENTITY", request_index: 1, http_status: 200 }],
    [
      { versionApp: "private-wrong-app" },
      { stage: "VERSION_IDENTITY", request_index: 1, http_status: 200 },
    ],
    [
      { intercept: () => new globalThis.Response("PRIVATE_PROVIDER_TEXT", { status: 400 }) },
      { stage: "BUILD_FETCH", request_index: 1, http_status: 400 },
    ],
    [
      {
        intercept: () => {
          throw new Error("PRIVATE_NETWORK_TEXT");
        },
      },
      { stage: "BUILD_FETCH", request_index: 1, http_status: null },
    ],
  ]) {
    const f = fixture(overrides);
    const receipt = await f.audit();
    assert.equal(receipt.complete, false);
    assert.deepEqual(receipt.failure, expected);
    assert.equal(receipt.plan, undefined);
    assert.ok(!JSON.stringify(receipt).includes("PRIVATE"));
    assert.ok(!JSON.stringify(receipt).includes("private-wrong-app"));
    assert.ok(f.calls.every((call) => call.method === "GET"));
  }
});

test("group failure diagnostics retain only bounded counts, booleans and fixed enums", async () => {
  const groups = fixture().state.groups.map((g) => ({ ...g }));
  groups[0].publicLink = "invalid-private-value";
  const f = fixture({ groups });
  const receipt = await f.audit();
  assert.equal(receipt.complete, false); // Diagnostic collection never relaxes the guard.
  assert.equal(receipt.failure.stage, "GROUP_IDENTITY");
  assert.equal(receipt.failure.http_status, 200);
  assert.deepEqual(receipt.failure.group_shape, {
    data_count: 2,
    has_next: false,
    paging_total_matches: null,
    included_app_matches: 1,
    known_groups: [
      {
        matches: 1,
        resource_identity_valid: true,
        is_internal_group: true,
        parent: "MATCH",
        public_link: "INVALID",
      },
      {
        matches: 1,
        resource_identity_valid: true,
        is_internal_group: false,
        parent: "MATCH",
        public_link: "DISABLED",
      },
    ],
  });
  assert.ok(!JSON.stringify(receipt.failure).includes("@"));
  for (const privateValue of [
    "owner-group",
    "roberto-group",
    "Dove Bevo owner testing",
    "Roberto feedback",
  ])
    assert.ok(!JSON.stringify(receipt.failure.group_shape).includes(privateValue));
  assert.deepEqual(receipt.failure.app_groups, [
    {
      id: "owner-group",
      name: "Dove Bevo owner testing",
      is_internal_group: true,
      public_link: "INVALID",
    },
    {
      id: "roberto-group",
      name: "Roberto feedback",
      is_internal_group: false,
      public_link: "DISABLED",
    },
  ]);
  assert.ok(!JSON.stringify(receipt.failure).includes("PRIVATE"));
});

test("Apple's null public-link field is valid only for the verified internal group", async () => {
  const groups = fixture().state.groups.map((group) => ({ ...group }));
  groups[0].publicLink = null;
  const f = fixture({ groups });
  const receipt = await f.audit();
  assert.equal(receipt.complete, true);
  assert.equal(receipt.ready, true);
  assert.equal(receipt.before.groups[0].public_link_enabled, null);
  for (const externalValue of [null, undefined, true, "invalid"]) {
    const badGroups = groups.map((group) => ({ ...group }));
    badGroups[1].publicLink = externalValue;
    const rejected = await fixture({ groups: badGroups }).audit();
    assert.equal(rejected.plan, undefined);
    assert.notEqual(rejected.ready, true);
  }
});

test("audit records renamed same-app groups privately but produces no plan for historical-name mismatch", async () => {
  const groups = fixture().state.groups.map((group) => ({ ...group }));
  groups[0].name = "Dove bevo owner testing";
  const f = fixture({ groups });
  const receipt = await f.audit();
  assert.equal(receipt.complete, false);
  assert.equal(receipt.plan, undefined);
  assert.equal(receipt.failure.app_groups[0].name, "Dove bevo owner testing");
  assert.equal(receipt.failure.group_shape.known_groups[0].matches, 0);
  assert.ok(!JSON.stringify(receipt).includes("tester@example.test"));
  assert.ok(f.calls.every((call) => call.method === "GET"));
});

test("bounded group-name metadata rejects controls, lone surrogates and oversized names", async () => {
  for (const name of ["private\u0000name", "private\ud800name", "x".repeat(121)]) {
    const groups = fixture().state.groups.map((group) => ({ ...group }));
    groups[0].name = name;
    const receipt = await fixture({ groups }).audit();
    assert.equal(receipt.complete, false);
    assert.equal(receipt.failure.app_groups[0].name, null);
    assert.ok(!JSON.stringify(receipt.failure).includes(JSON.stringify(name).slice(1, -1)));
  }
});

test("invalid local plan/hash is rejected before accessing credentials or transport", async () => {
  const f = fixture();
  const plan = (await f.audit()).plan;
  const neverCredentials = new Proxy(
    {},
    {
      get() {
        assert.fail("Credential access before local guard");
      },
    },
  );
  const cases = [
    [planBytes(plan), "0".repeat(64)],
    [planBytes({ ...plan, app_id: "other-app" })],
    [planBytes({ ...plan, build_number: "52" })],
    [planBytes({ ...plan, version: "2.0.0" })],
    [planBytes({ ...plan, build_id: "../../other" })],
    [planBytes({ ...plan, submit_beta_review_if_needed: false })],
    [planBytes({ ...plan, groups: [{ ...plan.groups[0], name: "Other group" }, plan.groups[1]] })],
    [
      planBytes({
        ...plan,
        groups: [plan.groups[0], { ...plan.groups[1], id: plan.groups[0].id }],
      }),
    ],
    [planBytes({ ...plan, groups: [plan.groups[1], plan.groups[0]] })],
    [Buffer.from(JSON.stringify(plan))],
    [
      Buffer.from(
        planBytes(plan)
          .toString()
          .replace('"schema_version": 1,', '"schema_version": 1, "schema_version": 1,'),
      ),
    ],
    [Buffer.alloc(8193)],
  ];
  for (const [bytes, approvedSha = sha256(bytes)] of cases) {
    await assert.rejects(
      applyBetaDistribution(neverCredentials, {
        bytes,
        approvedSha,
        checkpoint: f.checkpoint,
        transport() {
          assert.fail("Unexpected network");
        },
      }),
    );
  }
});

test("apply revalidates returned app, version, platform and relationship parents", async () => {
  const f = fixture();
  const plan = (await f.audit()).plan;
  for (const override of [
    { app: "different-app" },
    { number: "52" },
    { version: "1.0.1" },
    { platform: "MAC_OS" },
    { versionApp: "different-app" },
    { detailBuild: "other-build" },
  ]) {
    const bad = fixture(override);
    const receipt = await bad.apply(plan);
    assert.equal(receipt.complete, false);
    assert.ok(bad.calls.every((c) => c.method === "GET"));
  }
});

test("omitted nested version parent needs an independently matching app relationship", async () => {
  const f = fixture({ omitNestedVersionApp: true });
  const receipt = await f.audit();
  assert.equal(receipt.complete, true);
  assert.equal(receipt.ready, true);
  assert.equal(
    f.calls.filter((c) => c.path === "/v1/preReleaseVersions/version-1/relationships/app").length,
    1,
  );
  for (const overrides of [
    { omitNestedVersionApp: true, versionAppLink: "wrong-app" },
    { versionAppLink: "wrong-app" },
    { versionApp: "contradictory-app", versionAppLink: APP_ID },
  ]) {
    const bad = fixture(overrides);
    const failed = await bad.audit();
    assert.equal(failed.complete, false);
    assert.equal(failed.plan, undefined);
    assert.ok(bad.calls.every((c) => c.method === "GET"));
  }
});

test("omitted nested beta parent needs an independently matching exact build relationship", async () => {
  const f = fixture({ omitNestedBetaBuild: true });
  const receipt = await f.audit();
  assert.equal(receipt.complete, true);
  assert.equal(receipt.ready, true);
  assert.equal(
    f.calls.filter((c) => c.path === "/v1/buildBetaDetails/detail-62/relationships/build").length,
    1,
  );
  for (const overrides of [
    { omitNestedBetaBuild: true, betaBuildLink: "wrong-build" },
    { betaBuildLink: "wrong-build" },
    { detailBuild: "contradictory-build", betaBuildLink: "build-62" },
  ]) {
    const bad = fixture(overrides);
    const failed = await bad.audit();
    assert.equal(failed.complete, false);
    assert.equal(failed.plan, undefined);
    assert.ok(bad.calls.every((c) => c.method === "GET"));
  }
});

test("missing, duplicate, renamed, wrong-app or wrong-type groups cannot be distributed", async () => {
  const plan = (await fixture().audit()).plan;
  const original = fixture().state.groups;
  const cases = [
    original.slice(0, 1),
    [...original, { ...original[1], id: "third-group" }],
    [original[0], { ...original[1], name: "Renamed" }],
    [original[0], { ...original[1], app: "different-app" }],
    [original[0], { ...original[1], is_internal_group: true }],
    [original[0], { ...original[1], id: "replacement-group" }],
  ];
  for (const groups of cases) {
    const f = fixture({ groups });
    const receipt = await f.apply(plan);
    assert.equal(receipt.complete, false);
    assert.ok(f.calls.every((c) => c.method === "GET"));
  }
});

test("processing, expired, export-blocked, rejected or public external audiences fail closed", async () => {
  const plan = (await fixture().audit()).plan;
  for (const overrides of [
    { processing: "PROCESSING" },
    { expired: true },
    { expires: "2026-11-01T00:00:00Z" },
    { internal: "MISSING_EXPORT_COMPLIANCE" },
    { external: "IN_EXPORT_COMPLIANCE_REVIEW" },
    { external: "BETA_REJECTED" },
    { submission: { id: "rejected-62", state: "REJECTED" } },
    { groups: fixture().state.groups.map((g) => ({ ...g, publicLink: true })) },
    { groups: fixture().state.groups.map((g) => ({ ...g, publicLink: undefined })) },
  ]) {
    const f = fixture(overrides);
    const receipt = await f.apply(plan);
    assert.equal(receipt.complete, false);
    assert.ok(f.calls.every((c) => c.method === "GET"));
  }
});

test("exact existing groups are linked and one exact-build beta review is submitted", async () => {
  const f = fixture();
  const plan = (await f.audit()).plan;
  const before = f.calls.length;
  const receipt = await f.apply(plan);
  assert.equal(f.calls.length - before, 41);
  assert.equal(receipt.complete, true);
  assert.equal(receipt.actions.length, 3);
  assert.ok(receipt.actions.every((a) => a.outcome === "confirmed_by_read_back"));
  assert.equal(receipt.roberto_in_beta_testing, false);
  assert.equal(receipt.after.external_state, "WAITING_FOR_BETA_REVIEW");
  assert.deepEqual(
    f.calls.filter((c) => c.method === "POST").map((c) => c.path),
    [
      "/v1/betaGroups/owner-group/relationships/builds",
      "/v1/betaGroups/roberto-group/relationships/builds",
      "/v1/betaAppReviewSubmissions",
    ],
  );
  const second = await f.apply((await f.audit()).plan);
  assert.equal(second.complete, true);
  assert.deepEqual(second.actions, []);
  assert.equal(f.calls.filter((c) => c.method === "POST").length, 3);
});

test("worst-case final failure plus one reconciliation is bounded to 48 requests", async () => {
  const f = fixture();
  const plan = (await f.audit()).plan;
  const before = f.calls.length;
  let readsAfterSubmission = 0;
  f.state.intercept = (call) => {
    if (
      call.method === "GET" &&
      call.path === "/v1/betaAppReviewSubmissions" &&
      f.state.submission &&
      ++readsAfterSubmission === 2
    )
      return new globalThis.Response(null, { status: 503 });
  };
  const receipt = await f.apply(plan);
  assert.equal(receipt.complete, false);
  assert.equal(f.calls.length - before, 48);
  assert.equal(f.calls.filter((c) => c.method === "POST").length, 3);
  assert.ok(f.calls.slice(-7).every((c) => c.method === "GET"));
  assert.equal(receipt.after.submissions[0].id, "submission-62");
});

test("pending and approved review or testing states never create duplicate submissions", async () => {
  for (const overrides of [
    { external: "WAITING_FOR_BETA_REVIEW" },
    { external: "IN_BETA_REVIEW", submission: { id: "pending-62", state: "IN_REVIEW" } },
    { submission: { id: "pending-62", state: "WAITING_FOR_REVIEW" } },
    { submission: { id: "approved-62", state: "APPROVED" } },
    { external: "BETA_APPROVED" },
    { internal: "IN_BETA_TESTING", external: "IN_BETA_TESTING" },
  ]) {
    const f = fixture({ ...overrides, linked: new Set(["owner-group", "roberto-group"]) });
    const receipt = await f.apply((await f.audit()).plan);
    assert.equal(receipt.complete, true);
    assert.equal(f.calls.filter((c) => c.method === "POST").length, 0);
    assert.equal(receipt.roberto_in_beta_testing, overrides.external === "IN_BETA_TESTING");
  }
});

test("a created submission disappearing from final READY state cannot produce success or a retry", async () => {
  const f = fixture({ linked: new Set(["owner-group", "roberto-group"]) });
  const plan = (await f.audit()).plan;
  let readsAfterSubmission = 0;
  f.state.intercept = (call) => {
    if (
      call.method === "GET" &&
      call.path === "/v1/betaAppReviewSubmissions" &&
      f.state.submission
    ) {
      // The immediate read-back confirms the new ID; the final snapshot loses it.
      if (++readsAfterSubmission === 1) f.state.external = "READY_FOR_BETA_SUBMISSION";
      else f.state.submission = null;
    }
  };
  const receipt = await f.apply(plan);
  assert.equal(receipt.complete, false);
  assert.equal(receipt.beta_review_submission_id, "submission-62");
  assert.equal(receipt.after.external_state, "READY_FOR_BETA_SUBMISSION");
  assert.deepEqual(receipt.after.submissions, []);
  assert.equal(f.calls.filter((c) => c.method === "POST").length, 1);
  assert.ok(
    f.calls
      .slice(f.calls.findIndex((c) => c.method === "POST") + 1)
      .every((c) => c.method === "GET"),
  );
});

test("a final pending build state remains valid when the submission list is eventually consistent", async () => {
  const f = fixture({ linked: new Set(["owner-group", "roberto-group"]) });
  const plan = (await f.audit()).plan;
  let readsAfterSubmission = 0;
  f.state.intercept = (call) => {
    if (
      call.method === "GET" &&
      call.path === "/v1/betaAppReviewSubmissions" &&
      f.state.submission &&
      ++readsAfterSubmission > 1
    )
      f.state.submission = null;
  };
  const receipt = await f.apply(plan);
  assert.equal(receipt.complete, true);
  assert.equal(receipt.beta_review_submission_id, "submission-62");
  assert.equal(receipt.after.external_state, "WAITING_FOR_BETA_REVIEW");
  assert.deepEqual(receipt.after.submissions, []);
  assert.equal(receipt.roberto_in_beta_testing, false);
  assert.equal(f.calls.filter((c) => c.method === "POST").length, 1);
});

test("READY final state requires the same validated submission ID, not a replacement", async () => {
  const f = fixture({ linked: new Set(["owner-group", "roberto-group"]) });
  const plan = (await f.audit()).plan;
  let readsAfterSubmission = 0;
  f.state.intercept = (call) => {
    if (
      call.method === "GET" &&
      call.path === "/v1/betaAppReviewSubmissions" &&
      f.state.submission
    ) {
      f.state.external = "READY_FOR_BETA_SUBMISSION";
      if (++readsAfterSubmission > 1) f.state.submission.id = "replacement-submission";
    }
  };
  const receipt = await f.apply(plan);
  assert.equal(receipt.complete, false);
  assert.equal(receipt.beta_review_submission_id, "submission-62");
  assert.equal(receipt.after.submissions[0].id, "replacement-submission");
  assert.equal(f.calls.filter((c) => c.method === "POST").length, 1);
});

test("a review submission for another build is never treated as pending for 62", async () => {
  const f = fixture({
    submission: { id: "other-submission", state: "WAITING_FOR_REVIEW", build: "build-52" },
  });
  const receipt = await f.audit();
  assert.equal(receipt.complete, false);
  assert.equal(receipt.plan, undefined);
});

test("indeterminate group writes stop, retain uncertainty and reconcile only with GET", async () => {
  const f = fixture();
  const plan = (await f.audit()).plan;
  f.state.intercept = (call) => {
    if (call.method === "POST") {
      assert.equal(f.checkpoints.at(-1).actions.at(-1).outcome, "indeterminate");
      f.state.linked.add("owner-group");
      throw new Error("Private provider/network details never leave this boundary");
    }
  };
  const receipt = await f.apply(plan);
  assert.equal(receipt.complete, false);
  assert.equal(receipt.actions[0].outcome, "indeterminate");
  assert.equal(receipt.after.groups[0].linked, true);
  assert.equal(receipt.after.groups[1].linked, false);
  assert.equal(f.calls.filter((c) => c.method === "POST").length, 1);
  assert.ok(
    f.calls
      .slice(f.calls.findIndex((c) => c.method === "POST") + 1)
      .every((c) => c.method === "GET"),
  );
  assert.ok(!JSON.stringify(receipt).includes("Private provider"));
});

test("indeterminate review submissions are never automatically submitted twice", async () => {
  const f = fixture({ linked: new Set(["owner-group", "roberto-group"]) });
  const plan = (await f.audit()).plan;
  f.state.intercept = (call) => {
    if (call.method === "POST") {
      f.state.submission = { id: "committed-62", state: "WAITING_FOR_REVIEW" };
      f.state.external = "WAITING_FOR_BETA_REVIEW";
      throw new Error("Connection lost after commit");
    }
  };
  const receipt = await f.apply(plan);
  assert.equal(receipt.complete, false);
  assert.equal(receipt.actions.length, 1);
  assert.equal(receipt.actions[0].outcome, "indeterminate");
  assert.equal(receipt.after.submissions[0].id, "committed-62");
  assert.equal(f.calls.filter((c) => c.method === "POST").length, 1);
});

test("a failed durable checkpoint prevents dispatch and all later mutations", async () => {
  const f = fixture();
  const bytes = planBytes((await f.audit()).plan);
  await assert.rejects(
    applyBetaDistribution(env, {
      bytes,
      approvedSha: sha256(bytes),
      now,
      transport: f.transport,
      checkpoint() {
        throw new Error("Disk unavailable");
      },
    }),
  );
  assert.ok(f.calls.every((c) => c.method === "GET"));
});

test("real CLI persists partial writes and refuses POST when the pre-dispatch sync fails", async () => {
  const f = fixture();
  const responses = {};
  const audited = await auditBetaDistribution(env, {
    now,
    transport: async (url, options) => {
      const response = await f.transport(url, options);
      responses[new URL(url).pathname] = await response.clone().json();
      return response;
    },
  });
  responses["/v1/builds/build-62"] = {
    ...responses["/v1/builds"],
    data: responses["/v1/builds"].data[0],
  };
  for (const failSyncAt of [1, 2]) {
    const preload = `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const originalRead = fs.promises.readFile;
      fs.promises.readFile = async (path, ...rest) => path === 'synthetic-plan.json'
        ? Buffer.from(${JSON.stringify(planBytes(audited.plan).toString())}) : originalRead(path, ...rest);
      let syncs = 0, totalWritten = 0;
      fs.promises.open = async () => ({
        write: async (content, offset, length) => {
          const bytesWritten = Math.min(83, length); totalWritten += bytesWritten;
          return { bytesWritten };
        },
        truncate: async length => { if (totalWritten < length) throw new Error('PRIVATE_PARTIAL'); },
        sync: async () => { if (++syncs >= ${failSyncAt}) throw new Error('PRIVATE_SYNC'); },
        close: async () => {}
      });
      syncBuiltinESMExports();
      const responses = ${JSON.stringify(responses)};
      globalThis.fetch = async (url, options) => {
        if (options.method !== 'GET') console.log('TEST_POST_CALLED');
        return new Response(JSON.stringify(responses[new URL(url).pathname]), { headers: { 'content-type': 'application/json' } });
      };
    `;
    const child = spawnSync(
      process.execPath,
      [
        "--import",
        "data:text/javascript," + encodeURIComponent(preload),
        fileURLToPath(new URL("../mobile-beta-distribution.mjs", import.meta.url)),
        "synthetic-receipt.json",
        "--apply",
        "--plan",
        "synthetic-plan.json",
        "--approved-plan-sha",
        audited.plan_sha256,
      ],
      { encoding: "utf8", env: { SystemRoot: process.env.SystemRoot, ...env }, timeout: 10000 },
    );
    assert.ifError(child.error);
    assert.equal(child.status, 1, child.stderr);
    assert.doesNotMatch(child.stdout, /TEST_POST_CALLED/);
    assert.match(child.stderr, /preserve its receipt and audit exact state before any retry/);
    assert.doesNotMatch(child.stderr + child.stdout, /PRIVATE|Bearer|BEGIN PRIVATE KEY/);
  }
});

test("changed eligibility immediately before a write prevents that write", async () => {
  const f = fixture();
  const plan = (await f.audit()).plan;
  let checks = 0;
  f.state.intercept = (call) => {
    if (call.path === "/v1/builds/build-62" && ++checks === 2) f.state.expired = true;
  };
  const receipt = await f.apply(plan);
  assert.equal(receipt.complete, false);
  assert.ok(f.calls.every((c) => c.method === "GET"));
});

test("a failed membership read-back stops before linking the next group or submitting", async () => {
  const f = fixture();
  const plan = (await f.audit()).plan;
  f.state.intercept = (call) => {
    if (
      call.method === "GET" &&
      f.state.linked.has("owner-group") &&
      call.path.includes("/owner-group/relationships/")
    )
      return json({ data: [] });
  };
  const receipt = await f.apply(plan);
  assert.equal(receipt.complete, false);
  assert.equal(receipt.actions[0].outcome, "indeterminate");
  assert.equal(f.calls.filter((c) => c.method === "POST").length, 1);
});

test("bounded nonredirecting transport rejects provider errors, oversized and malformed bodies", async () => {
  const responses = [
    () => new globalThis.Response("PRIVATE-RESPONSE", { status: 401 }),
    () =>
      new globalThis.Response("", { status: 302, headers: { Location: "https://other.example" } }),
    () => json({ errors: [{ detail: "PRIVATE-RESPONSE" }] }),
    () => json({ data: [], links: { next: ORIGIN + "/v1/builds?page=2" } }),
    () => new globalThis.Response("{}", { headers: { "Content-Type": "text/html" } }),
    () =>
      new globalThis.Response("{}", {
        headers: { "Content-Type": "application/json", "Content-Length": "262145" },
      }),
    () =>
      new globalThis.Response("x".repeat(262145), {
        headers: { "Content-Type": "application/json" },
      }),
    () =>
      new globalThis.Response(new Uint8Array([0xff]), {
        headers: { "Content-Type": "application/json" },
      }),
  ];
  for (const response of responses) {
    const receipt = await auditBetaDistribution(env, { now, transport: async () => response() });
    assert.equal(receipt.complete, false);
    assert.ok(!JSON.stringify(receipt).includes("PRIVATE-RESPONSE"));
    assert.equal(receipt.plan, undefined);
  }
});

test("initial workflow is one exact read-only tag with no apply or public-release path", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/mobile-beta-distribution.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /mobile-beta-distribution-audit\/20261102-v6/);
  assert.match(workflow, /github\.repository == 'robertovalerirv-beep\/dove-bevo'/);
  assert.match(
    workflow,
    /github\.ref == 'refs\/tags\/mobile-beta-distribution-audit\/20261102-v6'/,
  );
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /contents: read/);
  assert.ok(!/--apply|workflow_dispatch|pull_request|write:|contents: write/.test(workflow));
  assert.match(
    workflow,
    /node scripts\/mobile-beta-distribution\.mjs "\$OUTPUT_PATH" --plan-output "\$PLAN_PATH"/,
  );
  const beforeSteps = workflow.slice(0, workflow.indexOf("    steps:"));
  assert.ok(!beforeSteps.includes("runner.temp"));
  for (const [, action] of workflow.matchAll(/uses:\s*(\S+)/g))
    assert.match(action, /@[a-f0-9]{40}$/);
});

test("build 271 has a separate exact read-only audit tag and no apply lane before a pinned plan", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/mobile-beta-distribution-271-audit.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /mobile-beta-distribution-audit\/20261103-build271-v1/);
  assert.match(workflow, /github\.repository == 'robertovalerirv-beep\/dove-bevo'/);
  assert.match(
    workflow,
    /github\.ref == 'refs\/tags\/mobile-beta-distribution-audit\/20261103-build271-v1'/,
  );
  assert.match(
    workflow,
    /node scripts\/mobile-beta-distribution\.mjs "\$OUTPUT_PATH" --plan-output "\$PLAN_PATH" --build-number 271/,
  );
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.ok(
    !/--apply|workflow_dispatch|pull_request|write:|contents: write|mobile-beta-distribution-apply/.test(
      workflow,
    ),
  );
  for (const [, action] of workflow.matchAll(/uses:\s*(\S+)/g))
    assert.match(action, /@[a-f0-9]{40}$/);
});

test("separate apply workflow pins the audited canonical bytes and exact existing identities", async () => {
  const reviewedSha = "8faec4021b7bf33775780ac1a7e62efd4059d4d57468fe740084a8c6e0d129c9";
  const bytes = await readFile(
    new URL("../../mobile-apps/data/beta-distribution-20261102.json", import.meta.url),
  );
  assert.equal(sha256(bytes), reviewedSha);
  assert.equal(bytes.includes(13), false);
  const plan = validatePlan(bytes, reviewedSha);
  assert.equal(plan.app_id, "6827324444");
  assert.equal(plan.build_id, "ff8ec5ad-3325-4f0e-b0d0-74e66d5a63cf");
  assert.equal(plan.build_number, "62");
  assert.equal(plan.version, "1.0.0");
  assert.deepEqual(plan.groups, [
    {
      id: "c8a85ec6-997c-4a9c-b241-7a1efbf756eb",
      name: "Dove Bevo owner testing",
      is_internal_group: true,
    },
    {
      id: "31303001-c08a-4696-a87b-447304705279",
      name: "Roberto feedback",
      is_internal_group: false,
    },
  ]);
  const workflow = await readFile(
    new URL("../../.github/workflows/mobile-beta-distribution-apply.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /github\.repository == 'robertovalerirv-beep\/dove-bevo'/);
  assert.match(workflow, /github\.event_name == 'push'/);
  assert.match(
    workflow,
    /github\.ref == 'refs\/tags\/mobile-beta-distribution-apply\/20261102-v1'/,
  );
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /--plan mobile-apps\/data\/beta-distribution-20261102.json/);
  assert.ok(workflow.includes("--approved-plan-sha " + reviewedSha));
  assert.equal([...workflow.matchAll(/--apply/g)].length, 1);
  assert.ok(
    !/workflow_dispatch|inputs:|pull_request|environment:|contents: write|latest/.test(workflow),
  );
  const beforeSteps = workflow.slice(0, workflow.indexOf("    steps:"));
  assert.ok(!beforeSteps.includes("runner.temp"));
  assert.ok(!beforeSteps.includes("secrets."));
  for (const [, action] of workflow.matchAll(/uses:\s*(\S+)/g))
    assert.match(action, /@[a-f0-9]{40}$/);
});
