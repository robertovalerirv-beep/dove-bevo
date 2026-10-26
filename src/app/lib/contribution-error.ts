/** Inspect a clone so ordinary quota/auth/network handling still owns the original response. */
export async function isContributionRestriction(response: Response): Promise<boolean> {
  if (response.status !== 429) return false;
  try {
    const body: unknown = await response.clone().json();
    return (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      "code" in body.error &&
      body.error.code === "contribution_restricted"
    );
  } catch {
    return false;
  }
}

export class ContributionRestrictedError extends Error {}
