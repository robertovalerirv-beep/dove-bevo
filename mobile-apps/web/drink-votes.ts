import { z } from "zod";
import { CELL_PATTERN } from "../../src/shared/venue.ts";
import {
  mobileCustomerItemKeyPattern,
  mobileOfferIdPattern,
  mobileVenueKeyPattern,
  validCategory,
} from "./routes.ts";

const VOTER_KEY = "dovebevo-mobile-drink-voter-v2";
const VOTER_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OfferTarget = z.object({
  kind: z.literal("offer"),
  id: z.string().regex(mobileOfferIdPattern),
});
const CustomerTarget = z.object({
  kind: z.literal("customer"),
  id: z.string().regex(mobileCustomerItemKeyPattern),
});
const LegacyTarget = z.object({
  kind: z.literal("legacy"),
  drink: z.string().refine(validCategory),
  band: z.enum(["normal", "happy_hour"]),
});
const Target = z.discriminatedUnion("kind", [OfferTarget, CustomerTarget, LegacyTarget]);
const VoteItem = z.object({
  target: Target,
  count: z.number().int().nonnegative(),
  recommended: z.boolean(),
});
const VenueSnapshot = z.object({
  schema_version: z.literal(1),
  venue: z.object({ key: z.string(), cell: z.string(), name: z.string() }),
  items: z.array(VoteItem).max(10000),
});

export type DrinkVoteTarget = z.infer<typeof Target>;
export type DrinkVoteItem = z.infer<typeof VoteItem>;

export function voteTargetKey(target: DrinkVoteTarget): string {
  const parsed = Target.parse(target);
  switch (parsed.kind) {
    case "offer":
      return `offer:${parsed.id}`;
    case "customer":
      return `customer:${parsed.id}`;
    case "legacy":
      return `legacy:${parsed.drink}:${parsed.band}`;
  }
}

export function mobileVoterId(): string | null {
  try {
    const existing = localStorage.getItem(VOTER_KEY);
    if (existing && VOTER_PATTERN.test(existing)) return existing;
    const created = crypto.randomUUID();
    if (!VOTER_PATTERN.test(created)) return null;
    localStorage.setItem(VOTER_KEY, created);
    return created;
  } catch {
    return null;
  }
}

function venueURL(key: string, cell: string): string {
  if (!mobileVenueKeyPattern.test(key) || !CELL_PATTERN.test(cell))
    throw new TypeError("Invalid vote venue");
  return `/api/mobile/v2/drink-votes/venues/${encodeURIComponent(key)}?cell=${encodeURIComponent(cell)}`;
}

export async function loadDrinkVotes(
  key: string,
  cell: string,
  voter: string | null,
  signal?: AbortSignal,
): Promise<Map<string, DrinkVoteItem>> {
  const response = await fetch(venueURL(key, cell), {
    method: "GET",
    headers: voter ? { "X-DoveBevo-Voter": voter } : undefined,
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(`Vote read failed: ${String(response.status)}`);
  const snapshot = VenueSnapshot.parse(await response.json());
  if (snapshot.venue.key !== key || snapshot.venue.cell !== cell)
    throw new Error("Vote venue identity mismatch");
  const items = new Map<string, DrinkVoteItem>();
  for (const item of snapshot.items) {
    const identity = voteTargetKey(item.target);
    if (items.has(identity)) throw new Error("Duplicate vote identity");
    items.set(identity, item);
  }
  return items;
}

export async function setDrinkVote(
  key: string,
  cell: string,
  voter: string,
  target: DrinkVoteTarget,
  recommended: boolean,
): Promise<DrinkVoteItem> {
  if (!VOTER_PATTERN.test(voter)) throw new TypeError("Invalid voter identity");
  const expected = voteTargetKey(target);
  const response = await fetch(venueURL(key, cell), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-DoveBevo-Voter": voter },
    body: JSON.stringify({ target, recommended }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Vote write failed: ${String(response.status)}`);
  const item = VoteItem.parse(await response.json());
  if (voteTargetKey(item.target) !== expected || item.recommended !== recommended)
    throw new Error("Vote response identity mismatch");
  return item;
}
