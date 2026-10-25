-- SPEC 1.9, D-34 (ADR 0033): «Gestore verificato». A row means the admin turned it on for the bar; deleting
-- it turns it off. Only the bar key, its cell (for the cell read), its name (for the admin list) and the
-- opening hours as JSON (src/shared/hours.ts). No contract dates, amounts, payments or manager data.
CREATE TABLE venues_verified (
  venue_key TEXT PRIMARY KEY,
  cell TEXT NOT NULL,
  name TEXT NOT NULL,
  hours TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX vv_cell ON venues_verified (cell);
-- The answer of a cell gains `g` (SPEC 9.2): no stored snapshot may stand without it (ADR 0032).
DELETE FROM cell_snapshot;
