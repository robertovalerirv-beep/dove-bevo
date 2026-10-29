-- ADR 0042: distinguish a one-time official-menu observation from a customer contribution.
-- Preserve every existing row, id, status and index. No historical migration is modified.
CREATE TABLE prices_menu_migration (
  venue_key TEXT NOT NULL, drink TEXT NOT NULL, hh INTEGER NOT NULL DEFAULT 0,
  cell TEXT NOT NULL, city INTEGER, price_cents INTEGER NOT NULL, observed_on TEXT NOT NULL,
  confirmations INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','quarantined','review','removed')),
  source TEXT NOT NULL CHECK (source IN ('manual','menu_photo','menu')),
  PRIMARY KEY (venue_key, drink, hh)
) WITHOUT ROWID;
INSERT INTO prices_menu_migration
  SELECT venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source
  FROM prices_current;
DROP TABLE prices_current;
ALTER TABLE prices_menu_migration RENAME TO prices_current;
CREATE INDEX pc_cell ON prices_current (cell, drink);

CREATE TABLE observations_menu_migration (
  id INTEGER PRIMARY KEY, venue_key TEXT NOT NULL, drink TEXT NOT NULL,
  hh INTEGER NOT NULL, price_cents INTEGER NOT NULL, observed_on TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual','menu_photo','menu')), status TEXT NOT NULL
);
INSERT INTO observations_menu_migration
  SELECT id, venue_key, drink, hh, price_cents, observed_on, source, status FROM price_obs;
DROP TABLE price_obs;
ALTER TABLE observations_menu_migration RENAME TO price_obs;
CREATE INDEX po_venue ON price_obs (venue_key, drink);

CREATE TABLE menu_seed_batches (
  batch_id TEXT PRIMARY KEY,
  manifest_sha256 TEXT NOT NULL UNIQUE CHECK (length(manifest_sha256) = 64),
  checked_on TEXT NOT NULL,
  applied INTEGER NOT NULL DEFAULT 0 CHECK (applied IN (0,1))
) WITHOUT ROWID;
-- Independent price evidence: never copy these fields into OSM catalogue files.
CREATE TABLE menu_seed_prices (
  record_hash TEXT PRIMARY KEY CHECK (length(record_hash) = 64),
  batch_id TEXT NOT NULL,
  venue_key TEXT NOT NULL, drink TEXT NOT NULL, hh INTEGER NOT NULL CHECK (hh IN (0,1)),
  cell TEXT NOT NULL, price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  currency TEXT NOT NULL CHECK (currency = 'EUR'),
  checked_on TEXT NOT NULL, published_on TEXT,
  menu_url TEXT NOT NULL, menu_item TEXT NOT NULL,
  serving TEXT, context TEXT,
  source_obs_id INTEGER NOT NULL UNIQUE,
  UNIQUE (venue_key, drink, hh)
) WITHOUT ROWID;
CREATE INDEX menu_seed_venue ON menu_seed_prices (venue_key, cell);
