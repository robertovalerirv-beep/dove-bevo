import { z } from "zod";

// Missing and null mean the count was not visible when the venue was checked.
// Zero is a reported count and must never be used as a substitute for unknown.
export const GoogleReviewCount = z.number().int().min(0).max(100000000).nullable().optional();
