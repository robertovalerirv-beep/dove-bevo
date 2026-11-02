-- App-only named menu facts. Legacy EUR prices and the website tables are unchanged.
-- Non-Italian OSM identities are curated separately; Italian OSM keys remain bound to static cells.
-- An Italian owner branch absent from static data uses m + first 24 hex of the SHA-256
-- fingerprint of canonical owner URL and normalized address; source-use review remains separate.
-- Owner-page identity_text_sha256 uses html_text_v1; geo evidence records its own hash basis.
CREATE TABLE mobile_menu_v2_venues (
  venue_key TEXT PRIMARY KEY,
  cell TEXT NOT NULL CHECK (length(cell) = 5),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 512),
  kind INTEGER NOT NULL CHECK (kind BETWEEN 0 AND 4),
  lat REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon REAL NOT NULL CHECK (lon BETWEEN -180 AND 180),
  address TEXT,
  city TEXT NOT NULL CHECK (length(city) BETWEEN 2 AND 200),
  country TEXT NOT NULL CHECK (country GLOB '[A-Z][A-Z]'),
  identity_kind TEXT NOT NULL CHECK (identity_kind IN ('osm','owner_verified')),
  identity_url TEXT NOT NULL CHECK (identity_url LIKE 'https://%'),
  identity_text_sha256 TEXT,
  identity_geo_url TEXT,
  identity_geo_text_sha256 TEXT,
  identity_geo_hash_basis TEXT CHECK (identity_geo_hash_basis IN ('raw_utf8','html_text_v1')),
  identity_fingerprint TEXT,
  identity_checked_on TEXT NOT NULL CHECK (length(identity_checked_on) = 10),
  CHECK (
    (identity_kind = 'osm' AND country <> 'IT' AND identity_fingerprint IS NULL
      AND identity_url LIKE 'https://www.openstreetmap.org/%'
      AND identity_text_sha256 IS NULL AND identity_geo_url IS NULL
      AND identity_geo_text_sha256 IS NULL AND identity_geo_hash_basis IS NULL
      AND substr(venue_key,1,1) IN ('n','w','r')
      AND length(venue_key) BETWEEN 2 AND 16
      AND substr(venue_key,2,1) BETWEEN '1' AND '9'
      AND substr(venue_key,2) NOT GLOB '*[^0-9]*')
    OR
    (identity_kind = 'owner_verified' AND country = 'IT'
      AND identity_fingerprint IS NOT NULL
      AND identity_url NOT LIKE 'https://www.openstreetmap.org/%'
      AND identity_text_sha256 IS NOT NULL AND length(identity_text_sha256) = 64
      AND identity_text_sha256 NOT GLOB '*[^0-9a-f]*'
      AND identity_geo_url IS NOT NULL AND identity_geo_url LIKE 'https://%'
      AND identity_geo_text_sha256 IS NOT NULL
      AND length(identity_geo_text_sha256) = 64
      AND identity_geo_text_sha256 NOT GLOB '*[^0-9a-f]*'
      AND identity_geo_hash_basis IS NOT NULL
      AND venue_key = ('m' || substr(identity_fingerprint,1,24))
      AND length(identity_fingerprint) = 64
      AND identity_fingerprint NOT GLOB '*[^0-9a-f]*'
      AND address IS NOT NULL AND length(address) BETWEEN 3 AND 500
      AND lat BETWEEN 35.2 AND 47.2 AND lon BETWEEN 6.5 AND 18.6)
  )
) WITHOUT ROWID;
CREATE INDEX mobile_menu_v2_venues_cell ON mobile_menu_v2_venues(cell, venue_key);
CREATE UNIQUE INDEX mobile_menu_v2_owner_fingerprint
  ON mobile_menu_v2_venues(identity_fingerprint) WHERE identity_fingerprint IS NOT NULL;

-- The hash is of captured source text. Review is an internal use decision, not a legal assertion.
-- A held snapshot stays held forever; a later approval creates a new immutable snapshot.
CREATE TABLE mobile_menu_v2_sources (
  id TEXT PRIMARY KEY,
  venue_key TEXT NOT NULL,
  cell TEXT NOT NULL CHECK (length(cell) = 5),
  source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%'),
  source_text_sha256 TEXT NOT NULL CHECK (
    length(source_text_sha256) = 64 AND source_text_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  source_checked_on TEXT NOT NULL CHECK (length(source_checked_on) = 10),
  use_review_status TEXT NOT NULL CHECK (use_review_status IN ('approved','held')),
  use_review_basis TEXT NOT NULL CHECK (length(use_review_basis) BETWEEN 3 AND 500),
  use_review_reference TEXT NOT NULL CHECK (length(use_review_reference) BETWEEN 3 AND 1000),
  use_reviewed_on TEXT NOT NULL CHECK (length(use_reviewed_on) = 10),
  UNIQUE (id, venue_key, cell)
) WITHOUT ROWID;
CREATE TRIGGER mobile_menu_v2_source_immutable_update BEFORE UPDATE ON mobile_menu_v2_sources
BEGIN SELECT RAISE(ABORT, 'v2 source snapshots are immutable'); END;
CREATE TRIGGER mobile_menu_v2_source_immutable_delete BEFORE DELETE ON mobile_menu_v2_sources
BEGIN SELECT RAISE(ABORT, 'v2 source snapshots are immutable'); END;

-- One stable ID per named menu offer, independent of category or serving size.
-- No observation date or confirmation is fabricated from an online menu check.
CREATE TABLE mobile_menu_v2_offers (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  venue_key TEXT NOT NULL,
  cell TEXT NOT NULL CHECK (length(cell) = 5),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 512),
  category TEXT CHECK (category IN (
    'beer_draft','spritz','negroni','sbagliato','gin_tonic','gin_lemon',
    'wine_glass','alcohol_free','water'
  )),
  serving_label TEXT CHECK (serving_label IS NULL OR length(serving_label) BETWEEN 1 AND 256),
  serving_ml INTEGER CHECK (serving_ml IS NULL OR serving_ml BETWEEN 1 AND 10000),
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor BETWEEN 1 AND 100000000),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  currency_exponent INTEGER NOT NULL CHECK (currency_exponent BETWEEN 0 AND 3),
  price_context TEXT NOT NULL CHECK (price_context IN ('regular','happy_hour','conditional')),
  condition_text TEXT CHECK (condition_text IS NULL OR length(condition_text) BETWEEN 1 AND 500),
  status TEXT NOT NULL CHECK (status IN ('active','review','removed')),
  source_id TEXT NOT NULL,
  CHECK (price_context <> 'conditional' OR condition_text IS NOT NULL),
  FOREIGN KEY (source_id, venue_key, cell)
    REFERENCES mobile_menu_v2_sources(id, venue_key, cell)
) WITHOUT ROWID;
CREATE INDEX mobile_menu_v2_offers_cell ON mobile_menu_v2_offers(cell, status, venue_key, id);
CREATE INDEX mobile_menu_v2_offers_venue ON mobile_menu_v2_offers(venue_key, cell, status, id);
CREATE TRIGGER mobile_menu_v2_offer_approved_insert BEFORE INSERT ON mobile_menu_v2_offers
WHEN NEW.status = 'active' AND NOT EXISTS (
  SELECT 1 FROM mobile_menu_v2_sources s WHERE s.id = NEW.source_id
    AND s.venue_key = NEW.venue_key AND s.cell = NEW.cell AND s.use_review_status = 'approved'
)
BEGIN SELECT RAISE(ABORT, 'v2 source use is held'); END;
CREATE TRIGGER mobile_menu_v2_offer_approved_update BEFORE UPDATE ON mobile_menu_v2_offers
WHEN NEW.status = 'active' AND NOT EXISTS (
  SELECT 1 FROM mobile_menu_v2_sources s WHERE s.id = NEW.source_id
    AND s.venue_key = NEW.venue_key AND s.cell = NEW.cell AND s.use_review_status = 'approved'
)
BEGIN SELECT RAISE(ABORT, 'v2 source use is held'); END;

-- Fixed charges can be per person, table, bill or source-unspecified.
-- Percentage charges apply to the bill; the currency and computed total stay unknown.
CREATE TABLE mobile_menu_v2_fees (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  venue_key TEXT NOT NULL,
  cell TEXT NOT NULL CHECK (length(cell) = 5),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 512),
  fee_kind TEXT NOT NULL CHECK (fee_kind IN ('fixed','percent')),
  basis TEXT NOT NULL CHECK (basis IN ('person','table','bill','unspecified')),
  amount_minor INTEGER,
  currency TEXT,
  currency_exponent INTEGER,
  rate_bps INTEGER,
  applicability TEXT NOT NULL CHECK (applicability IN ('all_orders','conditional','unknown')),
  condition_text TEXT CHECK (condition_text IS NULL OR length(condition_text) BETWEEN 1 AND 500),
  status TEXT NOT NULL CHECK (status IN ('active','review','removed')),
  source_id TEXT NOT NULL,
  CHECK (applicability <> 'conditional' OR condition_text IS NOT NULL),
  CHECK (
    (fee_kind = 'fixed' AND typeof(amount_minor) = 'integer'
      AND amount_minor BETWEEN 1 AND 100000000
      AND currency IS NOT NULL AND currency GLOB '[A-Z][A-Z][A-Z]'
      AND currency_exponent IS NOT NULL AND currency_exponent BETWEEN 0 AND 3 AND rate_bps IS NULL)
    OR
    (fee_kind = 'percent' AND basis = 'bill' AND amount_minor IS NULL
      AND currency IS NULL AND currency_exponent IS NULL
      AND typeof(rate_bps) = 'integer' AND rate_bps BETWEEN 1 AND 10000)
  ),
  FOREIGN KEY (source_id, venue_key, cell)
    REFERENCES mobile_menu_v2_sources(id, venue_key, cell)
) WITHOUT ROWID;
CREATE INDEX mobile_menu_v2_fees_venue ON mobile_menu_v2_fees(venue_key, cell, status, id);
CREATE TRIGGER mobile_menu_v2_fee_approved_insert BEFORE INSERT ON mobile_menu_v2_fees
WHEN NEW.status = 'active' AND NOT EXISTS (
  SELECT 1 FROM mobile_menu_v2_sources s WHERE s.id = NEW.source_id
    AND s.venue_key = NEW.venue_key AND s.cell = NEW.cell AND s.use_review_status = 'approved'
)
BEGIN SELECT RAISE(ABORT, 'v2 source use is held'); END;
CREATE TRIGGER mobile_menu_v2_fee_approved_update BEFORE UPDATE ON mobile_menu_v2_fees
WHEN NEW.status = 'active' AND NOT EXISTS (
  SELECT 1 FROM mobile_menu_v2_sources s WHERE s.id = NEW.source_id
    AND s.venue_key = NEW.venue_key AND s.cell = NEW.cell AND s.use_review_status = 'approved'
)
BEGIN SELECT RAISE(ABORT, 'v2 source use is held'); END;

-- No row means fee evidence is unknown. Documented fees are always partial unless
-- a source explicitly establishes that no mandatory fee applies.
CREATE TABLE mobile_menu_v2_fee_coverage (
  venue_key TEXT NOT NULL,
  cell TEXT NOT NULL CHECK (length(cell) = 5),
  status TEXT NOT NULL CHECK (status IN ('documented_partial','explicit_no_fee')),
  source_id TEXT NOT NULL,
  PRIMARY KEY (venue_key, cell),
  FOREIGN KEY (source_id, venue_key, cell)
    REFERENCES mobile_menu_v2_sources(id, venue_key, cell)
) WITHOUT ROWID;
CREATE TRIGGER mobile_menu_v2_fee_coverage_approved_insert
BEFORE INSERT ON mobile_menu_v2_fee_coverage
WHEN NOT EXISTS (
  SELECT 1 FROM mobile_menu_v2_sources s WHERE s.id = NEW.source_id
    AND s.venue_key = NEW.venue_key AND s.cell = NEW.cell AND s.use_review_status = 'approved'
)
BEGIN SELECT RAISE(ABORT, 'v2 source use is held'); END;
CREATE TRIGGER mobile_menu_v2_fee_coverage_approved_update
BEFORE UPDATE ON mobile_menu_v2_fee_coverage
WHEN NOT EXISTS (
  SELECT 1 FROM mobile_menu_v2_sources s WHERE s.id = NEW.source_id
    AND s.venue_key = NEW.venue_key AND s.cell = NEW.cell AND s.use_review_status = 'approved'
)
BEGIN SELECT RAISE(ABORT, 'v2 source use is held'); END;
