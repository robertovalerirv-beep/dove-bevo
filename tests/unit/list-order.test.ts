import { describe, expect, it } from "vitest";
import { compareListRows, type ListRow } from "../../src/app/lib/list-order";

// Order of the «Elenco» (SPEC 7.1, D-34, MD-07): verified bars first, then the order of before.
const row = (name: string, o: Partial<ListRow> = {}): ListRow => ({
  name,
  verified: false,
  priced: false,
  meters: null,
  ...o,
});
const order = (rows: ListRow[]) => [...rows].sort(compareListRows).map((r) => r.name);

describe("compareListRows", () => {
  it("without a position: verified first, then bars with a price, then by name", () => {
    expect(
      order([
        row("Zeta", { priced: true }),
        row("Alfa"),
        row("Verificato B", { verified: true }),
        row("Beta", { priced: true }),
        row("Verificato A", { verified: true, priced: true }),
      ]),
    ).toEqual(["Verificato A", "Verificato B", "Beta", "Zeta", "Alfa"]);
  });

  it("with a position: verified first, each group by distance", () => {
    expect(
      order([
        row("Vicino", { meters: 50 }),
        row("Verificato lontano", { verified: true, meters: 900 }),
        row("Lontano", { meters: 400, priced: true }),
        row("Verificato vicino", { verified: true, meters: 300 }),
      ]),
    ).toEqual(["Verificato vicino", "Verificato lontano", "Vicino", "Lontano"]);
  });

  it("the other bars keep exactly the order they had without verified bars", () => {
    const others = [
      row("Bar Duomo", { priced: true }),
      row("Armani Privè"),
      row("Bistrot", { priced: true }),
      row("Apophis"),
    ];
    const before = order(others);
    const after = order([...others, row("Camparino", { verified: true })]);
    expect(after).toEqual(["Camparino", ...before]);
  });

  it("names are compared the Italian way (accents, case)", () => {
    expect(order([row("Èden"), row("eclisse"), row("Ecco")])).toEqual(["Ecco", "eclisse", "Èden"]);
  });
});
