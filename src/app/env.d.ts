interface ImportMetaEnv {
  /** Set by the deploy job to the OSM import date; "fixture" when absent (local, e2e). */
  readonly VITE_DATA_VERSION?: string;
}
