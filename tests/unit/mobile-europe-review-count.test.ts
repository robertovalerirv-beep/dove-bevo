import { describe, expect, it } from "vitest";
import { GoogleReviewCount } from "../../mobile-apps/web/europe/review-count";

describe("app-only European venue review evidence", () => {
  it.each([0, 1, 12, 100, 101, null, undefined])(
    "accepts a verified count or an unknown value %j",
    (count) => {
      expect(GoogleReviewCount.safeParse(count).success).toBe(true);
    },
  );

  it.each([-1, 1.5, "100", true, 100_000_001])("rejects invalid review count %j", (count) => {
    expect(GoogleReviewCount.safeParse(count).success).toBe(false);
  });
});
