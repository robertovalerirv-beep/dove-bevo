// Secrets set with `wrangler secret` by Roberto or the CI (SPEC 13.6); `wrangler types` cannot see them.
interface Env {
  SESSION_HMAC_KEY: string;
  HASH_KEY: string;
  TURNSTILE_SECRET: string;
}
