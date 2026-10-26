// Order of the «Elenco» (SPEC 7.1, D-34): bars with «Gestore verificato» first, marked «Sponsorizzato»;
// within each group the same order for everyone: by distance when the position is known, otherwise
// bars with a price first, then by name.

export interface ListRow {
  name: string;
  verified: boolean;
  /** The bar shows a price of the chosen drinks. */
  priced: boolean;
  /** Distance from the user, null when the position is not known. */
  meters: number | null;
}

export function compareListRows(a: ListRow, b: ListRow): number {
  return (
    Number(b.verified) - Number(a.verified) ||
    (a.meters !== null && b.meters !== null
      ? a.meters - b.meters
      : Number(!a.priced) - Number(!b.priced) || a.name.localeCompare(b.name, "it"))
  );
}
