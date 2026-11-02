export interface SharePresentation {
  venue: string;
  venueName: string;
  drink: string;
  drinkName: string;
  hh: 0 | 1;
  amountMinor: number;
  currency: "EUR" | "GBP";
  serving: string;
  provenance: string;
  confirmations: number;
  tier: "affare" | "giusto" | "salato" | "neutro";
  location: string;
}

/** Inert metadata on the actual visible, active featured row; no native write bridge. */
export function sharePresentation(value: SharePresentation | null): Record<string, string> {
  if (!value || !value.provenance || value.provenance.length > 1024) return {};
  return {
    "data-dovebevo-share": "1",
    "data-version": "1",
    "data-venue": value.venue,
    "data-venue-name": value.venueName,
    "data-drink": value.drink,
    "data-drink-name": value.drinkName,
    "data-hh": String(value.hh),
    "data-amount-minor": String(value.amountMinor),
    "data-currency": value.currency,
    "data-serving": value.serving,
    "data-provenance": value.provenance,
    "data-confirmations": String(value.confirmations),
    "data-tier": value.tier,
    "data-location": value.location,
  };
}
