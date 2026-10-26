import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("checks iOS selection, startup failures, deadlines and owned cleanup with fake subprocesses", () => {
  expect(() =>
    execFileSync("python", ["tests/unit/native-ios-launch.py"], { stdio: "pipe" }),
  ).not.toThrow();
});
