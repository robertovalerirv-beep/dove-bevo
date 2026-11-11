// Order of the «Elenco» (SPEC 7.1, D-34): bars with «Gestore verificato» first, marked «Sponsorizzato».

export interface ListRow {
  name: string;
  verified: boolean;
  /** The bar shows a price of the chosen drinks. */
  priced: boolean;
  /** Distance from the user, null when the position is not known. */
  meters: number | null;
  /** The price shown (the cheapest of the chosen drinks), null when there is none. */
  cents?: number | null;
}

const byName = (a: ListRow, b: ListRow) => a.name.localeCompare(b.name, "it");

/**
 * Order of the native apps (unchanged by SPEC 1.19): within each group by distance when the position
 * is known, otherwise bars with a price first, then by name.
 */
export function compareListRows(a: ListRow, b: ListRow): number {
  return (
    Number(b.verified) - Number(a.verified) ||
    (a.meters !== null && b.meters !== null
      ? a.meters - b.meters
      : Number(!a.priced) - Number(!b.priced) || byName(a, b))
  );
}

/**
 * Order of the website (SPEC 1.19, MD-07): within each group the cheapest price first, bars without a
 * price last; same price by distance when the position is known, then by name.
 */
export function compareListRowsByPrice(a: ListRow, b: ListRow): number {
  const ca = a.cents ?? null;
  const cb = b.cents ?? null;
  return (
    Number(b.verified) - Number(a.verified) ||
    Number(ca === null) - Number(cb === null) ||
    (ca !== null && cb !== null ? ca - cb : 0) ||
    (a.meters !== null && b.meters !== null ? a.meters - b.meters : 0) ||
    byName(a, b)
  );
}
