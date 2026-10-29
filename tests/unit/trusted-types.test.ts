import { afterEach, describe, expect, it, vi } from "vitest";
import { installTrustedTypes } from "../../src/app/lib/trusted-types.ts";

// ADR 0045: with `require-trusted-types-for 'script'` the page makes one policy, `default`, that lets a script URL
// through only when it is ours (the files of /assets/, the service worker, the Turnstile script) and that
// cannot make HTML or script text, so the other sinks stay closed.
interface Rules {
  createScriptURL?: (input: string) => string;
  createHTML?: unknown;
  createScript?: unknown;
}

function install(): { name: string; rules: Rules } | null {
  let made: { name: string; rules: Rules } | null = null;
  vi.stubGlobal("trustedTypes", {
    createPolicy: (name: string, rules: Rules) => (made = { name, rules }),
  });
  vi.stubGlobal("location", new URL("https://www.dovebevo.com/"));
  installTrustedTypes();
  return made;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("installTrustedTypes", () => {
  it("makes the default policy, with a script URL check and nothing else", () => {
    const policy = install();
    expect(policy?.name).toBe("default");
    expect(typeof policy?.rules.createScriptURL).toBe("function");
    expect(policy?.rules.createHTML).toBeUndefined();
    expect(policy?.rules.createScript).toBeUndefined();
  });

  it("lets through the worker of the map, the service worker and the Turnstile script", () => {
    const check = install()?.rules.createScriptURL;
    for (const url of [
      "https://www.dovebevo.com/assets/maplibre-gl-worker-BrB25tGK.mjs",
      "/assets/index-A.js",
      "/sw.js",
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    ]) {
      expect(check?.(url), url).toBe(url);
    }
  });

  it("refuses every other script URL: other sites, other paths, data and javascript URLs", () => {
    const check = install()?.rules.createScriptURL;
    for (const url of [
      "https://evil.example/assets/x.js",
      "https://challenges.cloudflare.com/turnstile/v0/other.js",
      "/data/fixture/v/u0nd9.json",
      "/other.js",
      "data:text/javascript,alert(1)",
      "javascript:alert(1)",
      "//evil.example/assets/x.js",
    ]) {
      expect(() => check?.(url), url).toThrow();
    }
  });

  it("does nothing where the browser has no Trusted Types", () => {
    vi.stubGlobal("trustedTypes", undefined);
    expect(() => {
      installTrustedTypes();
    }).not.toThrow();
  });
});
