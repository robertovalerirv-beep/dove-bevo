import { describe, expect, it } from "vitest";
import { fragmentPath, leadWord, matches, rank, type Hit } from "../../src/app/lib/search-match";

// M4-12 / M4-13: matching and order of the bar search (the client side of ADR 0024).
describe("leadWord and fragmentPath", () => {
  it.each([
    ["caffe roma", "roma"],
    ["roma caf", "roma"],
    ["CAFFÈ ROMA", "roma"],
    ["bar sport", "sport"],
    ["sport bar", "sport"],
    ["bar", null],
    ["ab", null],
    ["caffè", null],
  ])("%s → %s", (query, word) => {
    expect(leadWord(query)).toBe(word);
  });
  it("uses 2 characters, or 3 when the prefix is split", () => {
    expect(fragmentPath("roma", [])).toBe("s/ro.json");
    expect(fragmentPath("caffetteria", ["ca"])).toBe("s/caf.json");
    expect(fragmentPath("roma", ["ca"])).toBe("s/ro.json");
  });
});

describe("matches", () => {
  it("is accent- and case-insensitive; every typed word starts a word of the name", () => {
    for (const q of ["caffe roma", "roma caf", "CAFFÈ ROMA", "caf rom"])
      expect(
        matches("Caffè Roma", q.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(" ")),
      ).toBe(true);
  });
  it("«bar sport» needs both words, in any order", () => {
    expect(matches("Bar Sport", ["bar", "sport"])).toBe(true);
    expect(matches("Bar Sport", ["sport", "bar"])).toBe(true);
    expect(matches("Salumeria dello Sport", ["bar", "sport"])).toBe(false);
    expect(matches("Bar Roma", ["bar", "sport"])).toBe(false);
  });
});

describe("rank", () => {
  const hit = (key: string, name: string, lat: number): Hit => [key, name, lat, 9.19, 1];
  const hits = [
    hit("n1", "Bar Sport Roma", 41.9), // far, starts with the text
    hit("n2", "Il Bar Sport", 45.46), // near, contains the text
    hit("n3", "Bar Sport", 41.9), // far, exact
    hit("n4", "Bar Sport Milano", 45.46), // near, starts with the text
    hit("n5", "Bar Sport Brera", 45.46), // near, starts with the text, alphabetical before Milano
  ];
  it("exact name, then start of the name, then distance, then alphabetical", () => {
    const names = rank(hits, "bar sport", { lat: 45.46, lon: 9.19 }).map((h) => h[1]);
    expect(names).toEqual([
      "Bar Sport",
      "Bar Sport Brera",
      "Bar Sport Milano",
      "Bar Sport Roma",
      "Il Bar Sport",
    ]);
  });
  it("without a known position the distance does not count", () => {
    const names = rank(hits, "bar sport", null).map((h) => h[1]);
    expect(names).toEqual([
      "Bar Sport",
      "Bar Sport Brera",
      "Bar Sport Milano",
      "Bar Sport Roma",
      "Il Bar Sport",
    ]);
  });
});
