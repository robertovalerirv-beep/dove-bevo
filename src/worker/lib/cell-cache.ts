import { forgetCoverage } from "./coverage";
import { invalidateCellSnapshot } from "./db";

const cellCacheKey = (url: string, cell: string) =>
  new Request(new URL(`/api/prices/${cell}`, url));

/** The edge-cache key of a cell, for the read route. */
export const edgeKey = cellCacheKey;

/**
 * Forgets a cell after a write of a person (a price, a confirmation, a bar sent to review, a proposed
 * bar): the snapshot row in D1 first, then the edge copy, so the next read, which the app makes right
 * away, rebuilds the answer from fresh data and not from the answer of a minute ago.
 * Only the cell: the dashboard figures keep their own minimum between two calculations (ADR 0022).
 */
export async function forgetCellCache(db: D1Database, url: string, cell: string): Promise<void> {
  await invalidateCellSnapshot(db, cell);
  await caches.default.delete(cellCacheKey(url, cell));
}

/** After an admin change: the cell as above, and the coverage figures of the dashboard (ADR 0025). */
export function forgetCell(db: D1Database, url: string, cell: string): Promise<void> {
  forgetCoverage();
  return forgetCellCache(db, url, cell);
}
