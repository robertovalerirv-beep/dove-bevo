import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../../.github/workflows/mobile-android-feedback-20261103.yml", import.meta.url),
  "utf8",
);

test("one exact internal Android tag preserves the independently verified source", () => {
  assert.match(workflow, /github\.repository == 'robertovalerirv-beep\/dove-bevo'/);
  assert.match(workflow, /github\.event_name == 'push' && github\.ref_type == 'tag'/);
  assert.match(
    workflow,
    /github\.ref == 'refs\/tags\/mobile-android-feedback\/20261103-build100-v1'/,
  );
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  for (const [path, expected] of [
    ["mobile-apps/android", "acdf8da88628f759ea74c0c0f324f2ef6a5785eb"],
    ["mobile-apps/presentation", "ccf726821dbd72ab7a4f240830ba49ea97115e04"],
    ["mobile-apps/scripts/release-android.sh", "51636349982d32bec117ab712270dec84327ee7a"],
  ]) {
    assert.ok(workflow.includes(`$(git rev-parse HEAD:${path})\" == ${expected}`));
  }
});

test("credentials follow all Android checks and produce only the existing signed bundle", () => {
  const unit = workflow.indexOf(":app:testDebugUnitTest :app:lintDebug :app:assembleDebug");
  const guards = workflow.indexOf(
    "python3 -B mobile-apps/android/tests/release_android_test.py -q",
  );
  const runtime = workflow.indexOf("-p 'test_android_smoke.py' -q");
  const secret = workflow.indexOf("${{ secrets.DOVEBEVO_ANDROID_KEYSTORE_BASE64 }}");
  const sign = workflow.indexOf("run: bash mobile-apps/scripts/release-android.sh");
  assert.ok(unit > 0 && guards > unit && runtime > guards && secret > runtime && sign > secret);
  assert.match(workflow, /DOVEBEVO_BUILD_NUMBER: "100"/);
  assert.ok(100 > 72, "candidate must exceed the live observed version code");
  assert.match(workflow, /mobile-apps\/android\/app\/build\/outputs\/bundle\/release\/\*\.aab/);
  assert.ok(
    !/workflow_dispatch|pull_request|DOVEBEVO_ASC_|DOVEBEVO_IOS_|play-publisher|fastlane|--upload|contents: write|if:.*always\(\).*Sign/.test(
      workflow,
    ),
  );
  assert.ok(!/path:.*(?:keystore|\.p12|\.jks|signing)/i.test(workflow));
  for (const [, action] of workflow.matchAll(/uses:\s*(\S+)/g))
    assert.match(action, /@[a-f0-9]{40}$/);
});
