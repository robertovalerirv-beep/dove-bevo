// Drink catalog (SPEC 6). size_ml 0 = standard cocktail serving. Limits are inclusive, in cents.
export interface DrinkSize {
  ml: number;
  min: number;
  max: number;
}

export interface Drink {
  code: string;
  sizes: DrinkSize[];
  /** Index in `sizes` of the preselected size. */
  defaultSize: number;
}

export const CATALOG: readonly Drink[] = [
  {
    code: "beer_draft",
    sizes: [
      { ml: 200, min: 150, max: 800 },
      { ml: 400, min: 250, max: 1200 },
      { ml: 500, min: 300, max: 1400 },
    ],
    defaultSize: 1,
  },
  { code: "beer_bottle", sizes: [{ ml: 330, min: 200, max: 1000 }], defaultSize: 0 },
  { code: "spritz", sizes: [{ ml: 0, min: 250, max: 1500 }], defaultSize: 0 },
  { code: "gin_tonic", sizes: [{ ml: 0, min: 400, max: 2000 }], defaultSize: 0 },
  { code: "negroni", sizes: [{ ml: 0, min: 400, max: 2000 }], defaultSize: 0 },
  { code: "wine_glass", sizes: [{ ml: 150, min: 200, max: 1500 }], defaultSize: 0 },
  { code: "prosecco", sizes: [{ ml: 150, min: 200, max: 1500 }], defaultSize: 0 },
  { code: "alcohol_free", sizes: [{ ml: 0, min: 200, max: 1200 }], defaultSize: 0 },
  { code: "soft_drink", sizes: [{ ml: 330, min: 100, max: 800 }], defaultSize: 0 },
];

/** Map chips, in this order (SPEC 6). The first is the default. */
export const MAP_CHIPS = [
  { id: "beer_draft@400", drink: "beer_draft", size: 400 },
  { id: "spritz@0", drink: "spritz", size: 0 },
  { id: "gin_tonic@0", drink: "gin_tonic", size: 0 },
  { id: "wine_glass@150", drink: "wine_glass", size: 150 },
  { id: "alcohol_free@0", drink: "alcohol_free", size: 0 },
] as const;

export type ChipId = (typeof MAP_CHIPS)[number]["id"];

export function findSize(drink: string, ml: number): DrinkSize | undefined {
  return CATALOG.find((d) => d.code === drink)?.sizes.find((s) => s.ml === ml);
}
