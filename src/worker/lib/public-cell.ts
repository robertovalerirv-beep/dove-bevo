import type { CellPrices } from "../../shared/api-types";

/** Legacy D1/edge bodies may contain unreviewed names. Never serve that field publicly. */
export function publicCellBody(body: string): string {
  const data = JSON.parse(body) as CellPrices;
  return JSON.stringify({ ...data, pend: [] });
}
