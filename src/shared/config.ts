// Single source for the product name and domain (SPEC 1). The domain is a placeholder until M6.
export const APP_NAME = "Dove bevo";
export const APP_DOMAIN = "dovebevo.example";

/** Launch gate (ADR 0022): bars with a price in the Comune di Milano (OSM id of its place node). */
export const LAUNCH_CITY_ID = 62505581;
export const LAUNCH_TARGET = 150;
/** The coverage dashboard reads every price once: past this many rows it costs too much D1 quota. */
export const COVERAGE_MAX_ROWS = 5000;
export const COVERAGE_WARN_ROWS = COVERAGE_MAX_ROWS * 0.8;
