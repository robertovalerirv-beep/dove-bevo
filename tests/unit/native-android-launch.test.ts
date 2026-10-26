import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("checks bounded Android setup, ownership, startup evidence and cleanup using fake processes", () => {
  expect(() =>
    execFileSync("python", ["tests/unit/native-android-launch.py"], { stdio: "pipe" }),
  ).not.toThrow();
});
