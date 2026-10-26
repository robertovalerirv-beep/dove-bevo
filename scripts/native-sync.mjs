import { spawnSync } from "node:child_process";
import { checkNativeOutput } from "../native/build-policy.ts";
checkNativeOutput("dist/native");
const args = process.argv.slice(2);
if (args.some((arg) => !["android", "ios"].includes(arg)))
  throw new Error("Only android or ios sync targets are allowed");
const result = spawnSync(
  process.execPath,
  ["node_modules/@capacitor/cli/bin/capacitor", "sync", ...args],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
