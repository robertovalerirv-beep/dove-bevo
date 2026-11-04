/** Apps-only public counts for exact menu items and venue drink/serving variants. */
export type ExactDrinkTarget =
  | { kind: "offer"; id: string }
  | { kind: "customer"; id: string }
  | { kind: "legacy"; drink: string; band: "normal" | "happy_hour" }
  | {
      kind: "europe";
      drink: string;
      band: "normal" | "happy_hour";
      currency: "EUR" | "GBP";
      serving: { unit: "drink" | "glass" | "ml"; ml?: number };
    };

export interface ExactDrinkVote {
  target: ExactDrinkTarget;
  count: number;
  recommended: boolean;
}

export interface ExactDrinkVenueVotes {
  schema_version: 1;
  venue: { key: string; cell: string; name: string };
  /** Only targets with a vote are returned. An absent live target has count 0. */
  items: ExactDrinkVote[];
}

export interface ExactDrinkAreaRow {
  venue: { key: string; cell: string; name: string; city: string | null };
  target: ExactDrinkTarget;
  drink: { name: string; category: string | null; serving_label: string | null };
  count: number;
}

export interface ExactDrinkAreaVotes {
  schema_version: 1;
  scope: { cells: string[] };
  items: ExactDrinkAreaRow[];
  next_after: string | null;
}
