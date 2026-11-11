-- App-only conditional minimum spend, separate from a drink price or additive fee.
-- Existing website and legacy customer-price tables are unchanged.
CREATE TABLE mobile_menu_v2_minimum_spends (
  id TEXT PRIMARY KEY CHECK (
    length(id) BETWEEN 1 AND 128 AND id NOT GLOB '*[^A-Za-z0-9._:-]*'
  ),
  venue_key TEXT NOT NULL,
  cell TEXT NOT NULL CHECK (length(cell) = 5),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 512),
  amount_minor INTEGER NOT NULL CHECK (
    typeof(amount_minor) = 'integer' AND amount_minor BETWEEN 1 AND 100000000
  ),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  currency_exponent INTEGER NOT NULL CHECK (currency_exponent BETWEEN 0 AND 3),
  basis TEXT NOT NULL CHECK (basis = 'person'),
  applicability TEXT NOT NULL CHECK (applicability IN ('all_orders','conditional')),
  condition_text TEXT CHECK (condition_text IS NULL OR length(condition_text) BETWEEN 3 AND 500),
  status TEXT NOT NULL CHECK (status IN ('active','review','removed')),
  source_id TEXT NOT NULL,
  CHECK (
    (applicability = 'conditional' AND condition_text IS NOT NULL) OR
    (applicability = 'all_orders' AND condition_text IS NULL)
  ),
  FOREIGN KEY (source_id, venue_key, cell)
    REFERENCES mobile_menu_v2_sources(id, venue_key, cell)
) WITHOUT ROWID;
CREATE INDEX mobile_menu_v2_minimum_spends_venue
  ON mobile_menu_v2_minimum_spends(venue_key, cell, status, id);
CREATE INDEX mobile_menu_v2_minimum_spends_cell
  ON mobile_menu_v2_minimum_spends(cell, status, venue_key, id);
CREATE TRIGGER mobile_menu_v2_minimum_spend_approved_insert
BEFORE INSERT ON mobile_menu_v2_minimum_spends
WHEN NEW.status = 'active' AND NOT EXISTS (
  SELECT 1 FROM mobile_menu_v2_sources s WHERE s.id = NEW.source_id
    AND s.venue_key = NEW.venue_key AND s.cell = NEW.cell AND s.use_review_status = 'approved'
)
BEGIN SELECT RAISE(ABORT, 'v2 source use is held'); END;
CREATE TRIGGER mobile_menu_v2_minimum_spend_approved_update
BEFORE UPDATE ON mobile_menu_v2_minimum_spends
WHEN NEW.status = 'active' AND NOT EXISTS (
  SELECT 1 FROM mobile_menu_v2_sources s WHERE s.id = NEW.source_id
    AND s.venue_key = NEW.venue_key AND s.cell = NEW.cell AND s.use_review_status = 'approved'
)
BEGIN SELECT RAISE(ABORT, 'v2 source use is held'); END;
