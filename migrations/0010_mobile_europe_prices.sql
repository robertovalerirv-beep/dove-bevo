-- Apps-only currency/serving prices. Existing website tables and tuples are unchanged.
CREATE TABLE mobile_menu_sources (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL CHECK (length(manifest_sha256) = 64 AND manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  catalog_version TEXT NOT NULL,
  venue_key TEXT NOT NULL,
  drink TEXT NOT NULL CHECK (drink IN ('beer_draft','spritz','negroni','sbagliato','gin_tonic','gin_lemon','wine_glass','alcohol_free','water')),
  hh INTEGER NOT NULL CHECK (hh IN (0,1)),
  currency TEXT NOT NULL CHECK (currency IN ('EUR','GBP')),
  serving_key TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor)='integer' AND amount_minor BETWEEN 1 AND 100000),
  source_url TEXT NOT NULL,
  source_sha256 TEXT NOT NULL CHECK (length(source_sha256) = 64 AND source_sha256 NOT GLOB '*[^0-9a-f]*'),
  source_checked_on TEXT NOT NULL,
  menu_item TEXT NOT NULL,
  UNIQUE (id, venue_key, drink, hh, currency, serving_key, amount_minor)
) WITHOUT ROWID;
CREATE TRIGGER mobile_source_immutable_update BEFORE UPDATE ON mobile_menu_sources
BEGIN SELECT RAISE(ABORT, 'mobile source snapshots are immutable'); END;
CREATE TRIGGER mobile_source_immutable_delete BEFORE DELETE ON mobile_menu_sources
BEGIN SELECT RAISE(ABORT, 'mobile source snapshots are immutable'); END;

CREATE TABLE mobile_prices_current (
  venue_key TEXT NOT NULL,
  drink TEXT NOT NULL CHECK (drink IN ('beer_draft','spritz','negroni','sbagliato','gin_tonic','gin_lemon','wine_glass','alcohol_free','water')),
  hh INTEGER NOT NULL CHECK (hh IN (0,1)),
  currency TEXT NOT NULL CHECK (currency IN ('EUR','GBP')),
  serving_key TEXT NOT NULL,
  cell TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor)='integer' AND amount_minor BETWEEN 1 AND 100000),
  observed_on TEXT,
  confirmed_on TEXT,
  confirmations INTEGER NOT NULL DEFAULT 0 CHECK (confirmations >= 0),
  status TEXT NOT NULL CHECK (status IN ('active','quarantined','review','removed')),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('customer','online_menu')),
  source_id TEXT,
  revision TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  CHECK ((source_kind = 'customer' AND source_id IS NULL AND observed_on IS NOT NULL)
      OR (source_kind = 'online_menu' AND source_id IS NOT NULL AND observed_on IS NULL)),
  FOREIGN KEY (source_id, venue_key, drink, hh, currency, serving_key, amount_minor)
    REFERENCES mobile_menu_sources(id, venue_key, drink, hh, currency, serving_key, amount_minor),
  PRIMARY KEY (venue_key, drink, hh, currency, serving_key)
) WITHOUT ROWID;
CREATE INDEX mobile_pc_cell ON mobile_prices_current(cell, drink, currency, serving_key, hh);

CREATE TABLE mobile_price_obs (
  id INTEGER PRIMARY KEY,
  venue_key TEXT NOT NULL,
  drink TEXT NOT NULL CHECK (drink IN ('beer_draft','spritz','negroni','sbagliato','gin_tonic','gin_lemon','wine_glass','alcohol_free','water')),
  hh INTEGER NOT NULL CHECK (hh IN (0,1)),
  currency TEXT NOT NULL CHECK (currency IN ('EUR','GBP')),
  serving_key TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor)='integer' AND amount_minor BETWEEN 1 AND 100000),
  observed_on TEXT,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('customer','online_menu')),
  source_id TEXT REFERENCES mobile_menu_sources(id),
  status TEXT NOT NULL CHECK (status IN ('active','quarantined','review','removed')),
  revision TEXT NOT NULL UNIQUE,
  changed_at TEXT NOT NULL,
  CHECK ((source_kind = 'customer' AND source_id IS NULL AND observed_on IS NOT NULL)
      OR (source_kind = 'online_menu' AND source_id IS NOT NULL AND observed_on IS NULL))
);
CREATE INDEX mobile_po_venue ON mobile_price_obs(venue_key, drink, hh, currency, serving_key);

CREATE TABLE mobile_price_reports (
  id INTEGER PRIMARY KEY,
  venue_key TEXT NOT NULL,
  target TEXT NOT NULL,
  revision TEXT,
  reason TEXT NOT NULL CHECK (reason IN ('wrong_price','closed','not_exists','wrong_info','offensive')),
  day TEXT NOT NULL
);
CREATE INDEX mobile_report_target ON mobile_price_reports(target, revision);
CREATE INDEX mobile_report_venue ON mobile_price_reports(venue_key);

-- Only a trusted operator/import workflow may manage blocks. No public block endpoint.
CREATE TABLE mobile_venues_moderation (
  venue_key TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('review','hidden')),
  reason TEXT NOT NULL
) WITHOUT ROWID;
