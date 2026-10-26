import { expect, it, vi } from "vitest";
import {
  isContributionRestricted,
  restrictionExpiry,
} from "../../src/worker/lib/contribution-restrictions";

it("bounds a full-capacity miss to 32 candidate HMACs and one indexed membership query", async () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  const refs = Array.from({ length: 16 }, (_, i) => ({
    family: i % 2 ? "price" : "proposal",
    target: i % 2 ? `n${String(i + 1)}|spritz|0` : `u${String(i + 1)}`,
    day: "2026-10-26",
    expires_at: restrictionExpiry("2026-10-26"),
  }));
  const queries: string[] = [];
  const db = {
    prepare(sql: string) {
      queries.push(sql);
      return {
        bind(...args: unknown[]) {
          if (sql.includes("FROM dedup")) expect(args).toHaveLength(34); // 32 candidates, 2 retained days
          return {
            all: () => Promise.resolve({ results: refs }),
            first: () => Promise.resolve(null),
          };
        },
      };
    },
  } as unknown as D1Database;
  const sign = vi.spyOn(crypto.subtle, "sign");
  const env = { DB: db, HASH_KEY: "test-restriction-benchmark" };
  const who = { sid: "test-session", ip: "192.0.2.1" };
  expect(await isContributionRestricted(env, who, now)).toBe(false);
  expect(sign).toHaveBeenCalledTimes(32);
  expect(queries.filter((q) => q.includes("FROM dedup"))).toHaveLength(1);
  expect(queries[1]).toContain("WHERE k IN (");
  sign.mockRestore();
  if (!refs[0]) throw new Error("missing fixture");
  refs.push(refs[0]);
  queries.length = 0;
  await expect(isContributionRestricted(env, who, now)).rejects.toMatchObject({ code: "busy" });
  expect(queries).toHaveLength(1); // no hashing/membership query when the invariant is violated
});
