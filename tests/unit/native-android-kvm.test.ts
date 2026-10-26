import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("checks isolated runner KVM ACL grants and exact restoration using injected commands", () => {
  expect(() =>
    execFileSync("python", ["tests/unit/native-android-kvm.py"], { stdio: "pipe" }),
  ).not.toThrow();
});

it("restores KVM in an always step before always-retained Android evidence", () => {
  const workflow = readFileSync(".github/workflows/mobile-preview.yml", "utf8");
  const prepare = workflow.indexOf("run: python3 scripts/mobile-ci-android-kvm.py prepare");
  const install = workflow.indexOf("run: python3 scripts/mobile-ci-android-launch.py setup");
  const launch = workflow.indexOf("run: python3 scripts/mobile-ci-android-launch.py launch");
  const restore = workflow.indexOf("run: python3 scripts/mobile-ci-android-kvm.py restore");
  const artifact = workflow.indexOf("name: android-preview-debug");
  expect(prepare).toBeGreaterThan(0);
  expect(install).toBeGreaterThan(prepare);
  expect(launch).toBeGreaterThan(install);
  expect(restore).toBeGreaterThan(launch);
  expect(artifact).toBeGreaterThan(restore);
  expect(workflow.slice(launch, restore)).toContain(
    "if: ${{ always() && steps.kvm_access.outcome != 'skipped' }}",
  );
  expect(workflow.slice(restore, artifact)).toContain("if: ${{ always() }}");
});
