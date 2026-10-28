/** Public totals and this anonymous installation's state, independent of price and happy hour. */
export interface MobileRecommendations {
  venue_key: string;
  drinks: { drink: string; count: number; recommended: boolean }[];
}
