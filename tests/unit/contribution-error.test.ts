import { expect, it } from "vitest";
import { isContributionRestriction } from "../../src/app/lib/contribution-error";

it("recognizes only the distinct restriction and leaves the original response readable", async () => {
  const body = { error: { code: "contribution_restricted" } };
  const response = Response.json(body, { status: 429 });
  expect(await isContributionRestriction(response)).toBe(true);
  expect(await response.json()).toEqual(body);
  for (const response of [
    Response.json(body),
    Response.json(body, { status: 401 }),
    Response.json({ error: { code: "rate_limited" } }, { status: 429 }),
    new Response("offline", { status: 429 }),
  ]) {
    expect(await isContributionRestriction(response)).toBe(false);
    expect(response.bodyUsed).toBe(false);
  }
});
