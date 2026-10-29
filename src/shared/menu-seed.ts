/** Optional provenance, outside the frozen seven-element legacy price tuple (ADR 0042). */
export interface MenuPriceSource {
  drink: string;
  hh: 0 | 1;
  price_cents: number;
  checked_on: string;
  published_on: string | null;
  menu_url: string;
  menu_item: string;
  serving: string | null;
  context: string | null;
}

export interface MenuPriceSources {
  prices: MenuPriceSource[];
}
