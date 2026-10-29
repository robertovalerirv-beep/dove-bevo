// Secrets set with `wrangler secret` by Roberto or the CI (SPEC 13.6); `wrangler types` sees them only
// as optional local vars. Required in both views of the environment.
interface Env {
  SESSION_HMAC_KEY: string;
  HASH_KEY: string;
  TURNSTILE_SECRET: string;
}
declare namespace Cloudflare {
  interface Env {
    SESSION_HMAC_KEY: string;
    HASH_KEY: string;
    TURNSTILE_SECRET: string;
  }
}
