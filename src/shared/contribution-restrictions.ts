/** A content/day cohort reference, never an actor identifier. ADR 0038. */
export interface ContributionRestriction {
  family: "price" | "proposal";
  target: string;
  day: string;
  expires_at: number;
}
export const RESTRICTION_CAPACITY = 16;
export interface RestrictionOverview {
  days: string[];
  restrictions: ContributionRestriction[];
  capacity: number;
}
