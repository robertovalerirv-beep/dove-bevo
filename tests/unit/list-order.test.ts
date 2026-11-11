import { describe, expect, it } from "vitest";
import {
  compareListRows,
  compareListRowsByPrice,
  type ListRow,
} from "../../src/app/lib/list-order";

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

// From SPEC 1.19 the website orders the «Elenco» by price (MD-07): verified bars first, then the
// cheapest price of the chosen drinks first, bars without a price last; ties by distance, then name.
// The native apps keep compareListRows above.
const priced = (name: string, cents: number | null, o: Partial<ListRow> = {}): ListRow =>
  row(name, { cents, priced: cents !== null, ...o });
const byPrice = (rows: ListRow[]) => [...rows].sort(compareListRowsByPrice).map((r) => r.name);

describe("compareListRowsByPrice", () => {
  it("cheapest first, bars without a price last", () => {
    expect(
      byPrice([
        priced("Terrazza Martini", 1000),
        priced("Apophis", null),
        priced("Shilling's", 800),
        priced("The Dome", 900),
        priced("20 - Twenty", null),
      ]),
    ).toEqual(["Shilling's", "The Dome", "Terrazza Martini", "20 - Twenty", "Apophis"]);
  });

  it("verified bars stay on top even when dearer, and are ordered by price among themselves", () => {
    expect(
      byPrice([
        priced("Economico", 500),
        priced("Verificato caro", 1200, { verified: true }),
        priced("Verificato senza prezzo", null, { verified: true }),
        priced("Verificato medio", 900, { verified: true }),
      ]),
    ).toEqual(["Verificato medio", "Verificato caro", "Verificato senza prezzo", "Economico"]);
  });

  it("same price: the nearer bar first when the position is known, otherwise by name", () => {
    expect(
      byPrice([priced("Lontano", 800, { meters: 900 }), priced("Vicino", 800, { meters: 100 })]),
    ).toEqual(["Vicino", "Lontano"]);
    expect(byPrice([priced("Zeta", 800), priced("Èden", 800), priced("Alfa", 800)])).toEqual([
      "Alfa",
      "Èden",
      "Zeta",
    ]);
  });

  it("the price wins over the distance", () => {
    expect(
      byPrice([
        priced("Vicino caro", 1000, { meters: 10 }),
        priced("Lontano", 600, { meters: 2000 }),
      ]),
    ).toEqual(["Lontano", "Vicino caro"]);
  });
});
