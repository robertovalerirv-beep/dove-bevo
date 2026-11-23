import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPrices, dayBucket, priceCount } from "../../src/app/lib/usage";

// MB-12 (D-29, SPEC 1.20): the Tessera is no longer shown; the one counter kept on the device stays,
// for the invitation to install (SPEC 12, M4-09).

describe("the counter", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("counts, takes back, never goes below zero and keeps only two keys", () => {
    expect(priceCount()).toBe(0);
    expect(addPrices(1, "2026-10-17")).toBe(1);
    expect(addPrices(1, "2026-10-18")).toBe(2);
    expect(addPrices(-1, "2026-10-18")).toBe(1);
    expect(addPrices(-5, "2026-10-18")).toBe(0);
    expect([...store.keys()].sort()).toEqual(["dovebevo-first-use", "dovebevo-prices"]);
    expect(store.get("dovebevo-first-use")).toBe("2026-10-17");
  });

  it("works without storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(priceCount()).toBe(0);
    expect(addPrices(1, "2026-10-17")).toBe(1);
  });

  it("buckets the days since the first use with the one existing key (SPEC 12)", () => {
    expect(dayBucket("2026-10-01")).toBe("0"); // stamps the first use
    expect(store.get("dovebevo-first-use")).toBe("2026-10-01");
    expect(dayBucket("2026-10-01")).toBe("0");
    expect(dayBucket("2026-10-02")).toBe("1-7");
    expect(dayBucket("2026-10-08")).toBe("1-7");
    expect(dayBucket("2026-10-09")).toBe("8-30");
    expect(dayBucket("2026-10-31")).toBe("8-30");
    expect(dayBucket("2026-11-01")).toBe("30+");
    expect([...store.keys()]).toEqual(["dovebevo-first-use"]);
  });
});
