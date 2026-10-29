// Trusted Types (CSP `require-trusted-types-for 'script'`): the default policy lets a script URL through only
// when it is one of ours, and offers no way to make HTML or script text, so those sinks stay closed.
const SCRIPT_URLS = ["/sw.js"];
const TURNSTILE = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function installTrustedTypes(): void {
  const tt = (
    globalThis as { trustedTypes?: { createPolicy(name: string, rules: object): unknown } }
  ).trustedTypes;
  if (!tt) return;
  tt.createPolicy("default", {
    createScriptURL(input: string): string {
      if (input === TURNSTILE) return input;
      const url = new URL(input, location.href);
      const ours = url.origin === location.origin;
      if (ours && (url.pathname.startsWith("/assets/") || SCRIPT_URLS.includes(url.pathname)))
        return input;
      throw new TypeError("Script URL refused");
    },
  });
}
