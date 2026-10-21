// Drink catalog (SPEC 6). One price per bar, drink and time band: there are no sizes. Limits are
// inclusive, in cents; the map filter and "Aggiungi prezzo" list the same drinks, in this order.
export interface Drink {
  code: string;
  min: number;
  max: number;
}

export const CATALOG: readonly Drink[] = [
  { code: "beer_draft", min: 250, max: 1200 },
  { code: "spritz", min: 250, max: 1500 },
  { code: "negroni", min: 400, max: 2000 },
  { code: "sbagliato", min: 400, max: 2000 },
  { code: "gin_tonic", min: 400, max: 2000 },
  { code: "gin_lemon", min: 400, max: 2000 },
  { code: "wine_glass", min: 200, max: 1500 },
  { code: "alcohol_free", min: 200, max: 1200 },
  { code: "water", min: 50, max: 600 },
];

/** Drink selected on the map at the start of a visit. */
export const DEFAULT_DRINK = "beer_draft";

export function findDrink(code: string): Drink | undefined {
  return CATALOG.find((d) => d.code === code);
}
