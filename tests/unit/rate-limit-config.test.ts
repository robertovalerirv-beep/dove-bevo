import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ADR 0027: the burst limiter is off for local and e2e runs (one IP, parallel tests: it made the write
// tests fail on a busy machine) and must stay on, at 20 requests / 10 s, where real people connect.
describe("RATE_LIMITER in wrangler.jsonc", () => {
  const source = readFileSync("wrangler.jsonc", "utf8");
  const limit = (namespace: string) =>
    new RegExp(
      `"RATE_LIMITER",\\s*"namespace_id":\\s*"${namespace}",\\s*"simple":\\s*\\{\\s*"limit":\\s*(\\d+),\\s*"period":\\s*(\\d+)`,
    ).exec(source);

  it("is 20 / 10 s in staging", () => {
    expect(limit("1002")?.slice(1, 3)).toEqual(["20", "10"]);
  });

  it("is off (3000) only in the top-level config used by local and e2e runs", () => {
    expect(limit("1001")?.slice(1, 3)).toEqual(["3000", "10"]);
  });

  it("has no environment that inherits the top-level limit by mistake", () => {
    // Every environment block repeats its own limiter (bindings are not inherited): none may use 1001.
    expect(source.match(/"namespace_id":\s*"1001"/g)).toHaveLength(1);
  });
});
