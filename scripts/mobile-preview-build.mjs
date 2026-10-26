// Build-only prerequisite. No Wrangler deploy, migrations, provisioning, credentials or remote API.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { checkMobilePreviewBuildConfig, checkMobilePreviewConfig } from "./check-config.ts";
import {
  createMobilePreviewConfig,
  LOCAL_PROOF_DATABASE_ID,
  MOBILE_PREVIEW_CONFIG_PATH,
} from "./mobile-preview-config.ts";

const args = process.argv.slice(2);
const localProof = args.length === 1 && args[0] === "--local-proof";
const databaseId = localProof
  ? LOCAL_PROOF_DATABASE_ID
  : args[0] === "--database-id" && args.length === 2
    ? args[1]
    : "";
if (!databaseId) throw new Error("Use --local-proof or --database-id <new preview D1 UUID>");
if (process.env.CLOUDFLARE_ENV || process.env.CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH)
  throw new Error("Clear inherited Cloudflare environment/config selection before building");
if (
  readdirSync(".").some(
    (name) => /^(?:\.env(?:\.|$)|\.dev\.vars(?:\.|$))/.test(name) && !name.endsWith(".example"),
  )
)
  throw new Error("Preview build refuses local env/secret files; use a clean worktree");
if (existsSync(MOBILE_PREVIEW_CONFIG_PATH))
  throw new Error(
    "Preview config already exists; inspect and deliberately remove it before regeneration",
  );
if (existsSync("public/data") && readdirSync("public/data").some((name) => name !== "fixture"))
  throw new Error(
    "Fixture preview refuses other datasets in public/data; use a clean build worktree",
  );
const parsed = ts.parseConfigFileTextToJson(
  "wrangler.jsonc",
  readFileSync("wrangler.jsonc", "utf8"),
);
if (parsed.error) throw new Error("Cannot read base wrangler.jsonc for isolation checks");
const config = createMobilePreviewConfig(databaseId, parsed.config, localProof);
const problems = checkMobilePreviewConfig(config, parsed.config, localProof);
if (problems.length) throw new Error(problems.join("\n"));

const output = resolve(".wrangler/mobile-preview-build");
if (!output.startsWith(`${resolve(".wrangler")}${sep}`))
  throw new Error("Preview output escaped its dedicated workspace directory");
if (existsSync(output))
  throw new Error(
    "Preview output already exists; inspect it before deliberately removing or replacing it",
  );
const redirect = ".wrangler/deploy/config.json";
const priorRedirect = existsSync(redirect) ? readFileSync(redirect) : undefined;
const inheritedEnv = {
  ...process.env,
  VITE_DATA_VERSION: "fixture",
  CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH: MOBILE_PREVIEW_CONFIG_PATH,
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
};
// A local build needs no account credentials and must not inherit a different dataset.
const env = Object.fromEntries(
  Object.entries(inheritedEnv).filter(
    ([key]) =>
      !(
        (/^(?:CLOUDFLARE_|CF_|VITE_)/.test(key) &&
          ![
            "CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH",
            "CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV",
            "VITE_DATA_VERSION",
          ].includes(key)) ||
        /^(?:TURNSTILE_SECRET|SESSION_HMAC_KEY|HASH_KEY)$/.test(key)
      ),
  ),
);
const run = (command) => {
  const result = spawnSync(process.execPath, command, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Preview build step failed (${String(result.status)})`);
};
let completed = false;
let proof;
try {
  writeFileSync(MOBILE_PREVIEW_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" });
  mkdirSync("public/data/fixture", { recursive: true });
  cpSync("tests/fixtures/data", "public/data/fixture", { recursive: true });
  run(["scripts/build-tokens.mjs"]);
  run(["node_modules/vite/bin/vite.js", "build", "--outDir", relative(".", output)]);
  const builtPath = join(output, "dovebevo_mobile_preview/wrangler.json");
  const builtBytes = readFileSync(builtPath);
  const buildProblems = checkMobilePreviewBuildConfig(
    JSON.parse(builtBytes.toString("utf8")),
    parsed.config,
    localProof,
  );
  if (buildProblems.length) throw new Error(buildProblems.join("\n"));
  const walk = (directory) =>
    readdirSync(directory).flatMap((name) => {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink())
        throw new Error("Preview output contains an unexpected symbolic link");
      return stat.isDirectory() ? walk(path) : [path];
    });
  const files = walk(output);
  for (const file of files) {
    if (
      /(?:^|[\\/])(?:\.env(?:\.|$)|\.dev\.vars(?:\.|$))|\.(?:map|ts|tsx|p12|pem|jks|keystore|mobileprovision)$/i.test(
        file,
      )
    )
      throw new Error("Preview build contains unreviewed source or credential material");
    if (
      /\.(?:js|mjs|json|html)$/.test(file) &&
      /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(readFileSync(file, "utf8"))
    )
      throw new Error("Preview output contains private key material");
  }
  const fixtureFiles = walk("tests/fixtures/data");
  if (walk(join(output, "client/data/fixture")).length !== fixtureFiles.length)
    throw new Error("Preview fixture assets contain unreviewed additional files");
  for (const fixture of fixtureFiles) {
    const asset = join(output, "client/data/fixture", relative("tests/fixtures/data", fixture));
    if (!existsSync(asset) || !readFileSync(asset).equals(readFileSync(fixture)))
      throw new Error("Preview fixture data missing or changed in actual assets");
  }
  proof = {
    profile: "disabled-unrouted-mobile-preview",
    localOnly: localProof,
    dataVersion: "fixture",
    workerName: config.name,
    configSha256: createHash("sha256").update(builtBytes).digest("hex"),
    workerSha256: createHash("sha256")
      .update(readFileSync(join(output, "dovebevo_mobile_preview/index.js")))
      .digest("hex"),
    filesChecked: files.length,
    deployed: false,
  };
  completed = true;
} finally {
  // Vite's redirect must never silently change the target of a later bare Wrangler command.
  if (priorRedirect) writeFileSync(redirect, priorRedirect);
  else if (existsSync(redirect)) rmSync(redirect);
  if (localProof || !completed) {
    if (existsSync(MOBILE_PREVIEW_CONFIG_PATH)) rmSync(MOBILE_PREVIEW_CONFIG_PATH);
    // This absolute target was checked above; it contains only this helper's outputs.
    if (existsSync(output)) rmSync(output, { recursive: true });
  }
}
// The local proof retains no config or executable artifact that could accidentally be deployed.
writeFileSync(".wrangler/mobile-preview-build-proof.json", `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof));
