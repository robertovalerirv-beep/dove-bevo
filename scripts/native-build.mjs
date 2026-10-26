import { spawnSync } from "node:child_process";
import { nativeBuildSettings } from "../native/build-policy.ts";

const args = new Set(process.argv.slice(2));
const env = { ...process.env };
env.NATIVE_CHANNEL = args.has("--release")
  ? "release"
  : args.has("--preview")
    ? "preview"
    : env.NATIVE_CHANNEL;
if (args.has("--fixture")) env.VITE_DATA_VERSION = "fixture";
nativeBuildSettings(env);
for (const command of [
  ["scripts/build-tokens.mjs"],
  ["node_modules/vite/bin/vite.js", "build", "--config", "vite.native.config.ts"],
]) {
  const result = spawnSync(process.execPath, command, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
