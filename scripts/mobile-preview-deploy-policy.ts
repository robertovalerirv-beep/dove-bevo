import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { resolve } from "node:path";
import { createMobilePreviewConfig } from "./mobile-preview-config.ts";

export const PREVIEW_REPOSITORY = "robertovalerirv-beep/dove-bevo";
export const PREVIEW_REF = "refs/heads/codex/mobile-launch-20261026";
export const PREVIEW_NAME = "dovebevo-mobile-preview";
export const PREVIEW_HOST = "mobile-preview.dovebevo.com";
// Any workflow change requires deliberate review and a new digest, including trigger/secret changes.
export const PREVIEW_WORKFLOW_SHA256 =
  "4e4ecdc0152cfc9e54e2ee78c16619d175896859deddb30c21061bd673e6aa54";
export const workflowDigest = (text: string) =>
  createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");

type Json = Record<string, unknown>;
type Environment = Record<string, string | undefined>;
export interface PreviewInputs {
  account: string;
  zone: string;
  database: string;
  sitekey: string;
  sha: string;
  previousSha: string;
}
const object = (value: unknown): value is Json =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const sha = /^[a-f0-9]{40}$/;
const tag = /^[a-f0-9]{32}$/;

export function requirePreviewActivation(env: Environment, head: string): PreviewInputs {
  if (env.MOBILE_PREVIEW_DEPLOY_ENABLED !== "true") throw new Error("DEPLOY_DISABLED");
  if (
    env.GITHUB_ACTIONS !== "true" ||
    env.GITHUB_EVENT_NAME !== "push" ||
    env.GITHUB_REPOSITORY !== PREVIEW_REPOSITORY ||
    env.GITHUB_REF !== PREVIEW_REF ||
    !sha.test(head) ||
    env.GITHUB_SHA !== head ||
    env.MOBILE_PREVIEW_APPROVED_SHA !== head ||
    env.MOBILE_PREVIEW_OWNER_APPROVED_SHA !== head
  )
    throw new Error("UNAPPROVED_PUSH");
  const account = env.MOBILE_PREVIEW_ACCOUNT_ID ?? "";
  const zone = env.MOBILE_PREVIEW_ZONE_ID ?? "";
  const database = env.MOBILE_PREVIEW_DATABASE_ID ?? "";
  const sitekey = env.MOBILE_PREVIEW_TURNSTILE_SITE_KEY ?? "";
  const previousSha = env.MOBILE_PREVIEW_PREVIOUS_SHA ?? "";
  if (
    !tag.test(account) ||
    !tag.test(zone) ||
    !/^0x4[A-Za-z0-9_-]{15,80}$/.test(sitekey) ||
    !(previousSha === "absent" || sha.test(previousSha))
  )
    throw new Error("INVALID_PUBLIC_INPUTS");
  if (env.CLOUDFLARE_ENV || env.CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH)
    throw new Error("INHERITED_TARGET_SELECTOR");
  return { account, zone, database, sitekey, sha: head, previousSha };
}

export function createPreviewDeploymentConfig(input: PreviewInputs, base: unknown, root: string) {
  const profile = createMobilePreviewConfig(input.database, base);
  if (!tag.test(input.account) || !tag.test(input.zone) || !sha.test(input.sha))
    throw new Error("INVALID_PUBLIC_INPUTS");
  if (!/^0x4[A-Za-z0-9_-]{15,80}$/.test(input.sitekey)) throw new Error("INVALID_PUBLIC_SITEKEY");
  const environments = object(base) && object(base.env) ? Object.values(base.env) : [];
  if (
    [base, ...environments].some(
      (entry) =>
        object(entry) && object(entry.vars) && entry.vars.TURNSTILE_SITE_KEY === input.sitekey,
    )
  )
    throw new Error("SHARED_TURNSTILE_WIDGET");
  return {
    ...profile,
    account_id: input.account,
    main: resolve(root, ".wrangler/mobile-preview-build/dovebevo_mobile_preview/index.js"),
    no_bundle: true,
    rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
    send_metrics: false,
    assets: {
      ...profile.assets,
      directory: resolve(root, ".wrangler/mobile-preview-build/client"),
    },
    routes: [
      { pattern: PREVIEW_HOST, custom_domain: true, enabled: true, previews_enabled: false },
    ],
    vars: {
      ...profile.vars,
      TURNSTILE_SITE_KEY: input.sitekey,
      MOBILE_PREVIEW_ENABLED: "true",
      MOBILE_PREVIEW_DEPLOYMENT_SHA: input.sha,
    },
    d1_databases: profile.d1_databases.map((db) => ({
      ...db,
      migrations_dir: resolve(root, "migrations"),
    })),
    secrets: { required: ["SESSION_HMAC_KEY", "HASH_KEY", "TURNSTILE_SECRET"] },
  };
}

export function assertPreviewDeploymentConfig(
  config: unknown,
  input: PreviewInputs,
  base: unknown,
  root: string,
) {
  if (!isDeepStrictEqual(config, createPreviewDeploymentConfig(input, base, root)))
    throw new Error("UNREVIEWED_DEPLOYMENT_CONFIG");
}
