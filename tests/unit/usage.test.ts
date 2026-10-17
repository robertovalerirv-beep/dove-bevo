import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPrices, priceCount, stampReached, TESSERA_STEPS } from "../../src/app/lib/usage";

// MB-12 (D-29): Tessera stamps from the one counter kept on the device (SPEC 12).
describe("stampReached", () => {
  it("has the stamps of D-29", () => {
    expect(TESSERA_STEPS).toEqual([1, 5, 10, 25, 50]);
  });
  it.each([
    [0, 1, 1],
    [1, 2, null],
    [4, 5, 5],
    [9, 10, 10],
    [24, 25, 25],
    [49, 50, 50],
    [50, 51, null],
    [0, 12, 10],
  ])("%i → %i reaches %s", (before, after, step) => {
    expect(stampReached(before, after)).toBe(step);
  });
});

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
});
