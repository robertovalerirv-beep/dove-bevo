import { describe, expect, it } from "vitest";
import { CATALOG, DEFAULT_DRINK, findDrink } from "../../src/shared/catalog";
import { it as italian } from "../../src/app/i18n/it";

// SPEC 1.6: the list of «Scegli cosa bere» and the grid of «Aggiungi prezzo» are the same list.
describe("one catalog for the map filter and the price entry", () => {
  it("is the list of Roberto, in his order", () => {
    expect(CATALOG.map((d) => italian.drinks[d.code])).toEqual([
      "Birra media",
      "Spritz",
      "Negroni",
      "Sbagliato",
      "Gin tonic",
      "Gin lemon",
      "Calice di vino",
      "Analcolico",
      "Acqua",
    ]);
  });

  it("has sane limits for every drink, in cents", () => {
    for (const d of CATALOG) {
      expect(d.min).toBeGreaterThan(0);
      expect(d.max).toBeGreaterThan(d.min);
    }
  });

  it("finds a drink by its code and nothing else", () => {
    for (const d of CATALOG) expect(findDrink(d.code)).toBe(d);
    for (const gone of ["beer_bottle", "prosecco", "soft_drink", "whisky"])
      expect(findDrink(gone)).toBeUndefined();
  });

  it("starts on a drink that exists", () => {
    expect(findDrink(DEFAULT_DRINK)).toBeDefined();
  });
});
