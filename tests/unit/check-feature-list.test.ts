import { describe, expect, it } from "vitest";
import { compareFeatureLists } from "../../scripts/feature-list.ts";

const a1 = { id: "A-01", milestone: "A", descrizione: "uno", verifica: "test uno", passes: false };
const a2 = { id: "A-02", milestone: "A", descrizione: "due", verifica: "test due", passes: false };
const base = [a1, a2];

describe("feature list guard (M0-06, D-21)", () => {
  it("accepts a change of passes only", () => {
    expect(compareFeatureLists(base, [{ ...a1, passes: true }, a2])).toEqual([]);
  });

  it("rejects a changed descrizione or verifica", () => {
    const current = [
      { ...a1, descrizione: "uno, più facile" },
      { ...a2, verifica: "nessuna" },
    ];
    expect(compareFeatureLists(base, current)).toEqual([
      "A-01: field descrizione changed",
      "A-02: field verifica changed",
    ]);
  });

  it("rejects a removed or added entry", () => {
    expect(compareFeatureLists(base, [a1])).toEqual(["A-02: removed"]);
    expect(compareFeatureLists(base, [a1, a2, { ...a1, id: "A-03" }])).toEqual(["A-03: added"]);
  });

  it("rejects a non-boolean passes or an extra field", () => {
    const current = [
      { ...a1, passes: "yes" },
      { ...a2, note: "x" },
    ];
    expect(compareFeatureLists(base, current)).toEqual([
      "A-01: passes must be true or false",
      "A-02: field note changed",
    ]);
  });
});
