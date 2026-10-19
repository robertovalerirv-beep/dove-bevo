import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matches, rank } from "../../src/app/lib/search-match";
import { searchWords } from "../../src/shared/venue";

// ADR 0025: the name search also finds the approved user bars (e.g. «Namasce», added by hand), which
// are not in the static fragments. The list comes from /api/venues/approved, once per visit, and
// goes through the same matching and ranking as the OSM bars (search-match.ts).
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
const shell = () => new Response("<html></html>", { headers: { "content-type": "text/html" } });

let calls: string[];
let approved: () => Response;

beforeEach(() => {
  vi.resetModules();
  calls = [];
  approved = () => json({ v: [["u7", "Namasce", 1, 45.46, 9.19]] });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      calls.push(url);
      return Promise.resolve(url === "/api/venues/approved" ? approved() : shell());
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function search(query: string) {
  const { loadUserBars } = await import("../../src/app/lib/user-bars");
  const typed = searchWords(query);
  return rank(
    (await loadUserBars()).filter((h) => matches(h[1], typed)),
    query,
    null,
  );
}

describe("approved user bars in the name search", () => {
  it("finds a bar added by hand by name, with accents and case ignored", async () => {
    for (const query of ["namasce", "NAMASC", "nam", "námasce"])
      expect((await search(query)).map((h) => h[0])).toEqual(["u7"]);
    expect(await search("naxasce")).toEqual([]);
  });

  it("the hit has the shape of an OSM one: key, name, position, no city", async () => {
    expect(await search("namasce")).toEqual([["u7", "Namasce", 45.46, 9.19, 0]]);
  });

  it("reads the list once per visit and never sends what was typed", async () => {
    await search("namasce");
    await search("namasce bar");
    expect(calls).toEqual(["/api/venues/approved"]);
  });

  it("an unavailable list only leaves the user bars out, and the next search tries again", async () => {
    approved = shell;
    expect(await search("namasce")).toEqual([]);
    approved = () => json({ v: [["u7", "Namasce", 1, 45.46, 9.19]] });
    expect((await search("namasce")).map((h) => h[0])).toEqual(["u7"]);
  });
});
