// Single source for the product name and domain (SPEC 1). The domain is a placeholder until M6.
export const APP_NAME = "Dove bevo";
export const APP_DOMAIN = "www.dovebevo.com";
/** Where owners and users write (rules, privacy): the mailbox of the project, not a personal address. */
export const CONTACT_EMAIL = "dovebevo@gmail.com";

/** "Annulla" after Salva (SPEC D-15): the price is sent when this runs out. One value for the timer, the progress bar and the texts. */
export const UNDO_MS = 5_000;

/** Launch gate (ADR 0022): bars with a price in the Comune di Milano (OSM id of its place node). */
export const LAUNCH_CITY_ID = 62505581;
export const LAUNCH_TARGET = 150;
/** The coverage dashboard reads every price once: past this many rows it costs too much D1 quota. */
export const COVERAGE_MAX_ROWS = 5000;
export const COVERAGE_WARN_ROWS = COVERAGE_MAX_ROWS * 0.8;

/** Price tiers against the cell median (D-12): thresholds and minimum sample, in one place. */
export const TIER_MIN_PRICES = 5;
export const TIER_CHEAP_BELOW = 0.9;
export const TIER_PRICEY_ABOVE = 1.1;
/** Prices observed more than this many days ago are marked "da confermare" (SPEC 7.1). */
export const STALE_DAYS = 90;
