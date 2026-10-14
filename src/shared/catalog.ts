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

/** Map chips: one per drink and size that can be entered, in catalog order (SPEC 6), so filter and entry always match. */
export const MAP_CHIPS = CATALOG.flatMap((d) =>
  d.sizes.map((s) => ({ id: `${d.code}@${String(s.ml)}`, drink: d.code, size: s.ml })),
);

export type ChipId = string;

/** Chip selected at the start of a visit: a 0,4 l draught beer. */
export const DEFAULT_CHIP = { id: "beer_draft@400", drink: "beer_draft", size: 400 };

export function findSize(drink: string, ml: number): DrinkSize | undefined {
  return CATALOG.find((d) => d.code === drink)?.sizes.find((s) => s.ml === ml);
}
