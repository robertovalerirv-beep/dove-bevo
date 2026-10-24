-- ADR 0020 (M3-20): one "snapshot" row per cell holds the compact answer of GET /api/prices/:cell, so a
-- read costs one row whatever the number of prices. `v` counts the changes of the cell: a writer bumps
-- it and empties `body`; a reader stores the body it computed only if `v` has not moved meanwhile.
-- `at` (ms) bounds how long a body can stand if a change ever forgot to empty it.
CREATE TABLE cell_snapshot (
  cell TEXT PRIMARY KEY,
  v INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL DEFAULT 0,
  body TEXT
) WITHOUT ROWID;
