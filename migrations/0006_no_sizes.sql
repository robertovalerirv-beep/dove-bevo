-- SPEC 1.6 (ADR 0028): a drink has no size any more; one price per bar, drink and time band.
-- The drinks that left the catalog (bottled beer, prosecco, soft drink) and the 0.2 and 0.5 l beers
-- have no place in the new list, and the 0.4 l beer takes the single "beer" key. Nothing is deleted:
-- those rows are copied to the archive_sizes_* tables, which stay for Roberto to drop when he wants.

CREATE TABLE archive_sizes_prices AS SELECT * FROM prices_current
  WHERE drink IN ('beer_bottle', 'prosecco', 'soft_drink') OR (drink = 'beer_draft' AND size_ml <> 400);
CREATE TABLE archive_sizes_obs AS SELECT * FROM price_obs
  WHERE drink IN ('beer_bottle', 'prosecco', 'soft_drink') OR (drink = 'beer_draft' AND size_ml <> 400);
CREATE TABLE archive_sizes_reports AS SELECT * FROM reports
  WHERE drink IN ('beer_bottle', 'prosecco', 'soft_drink') OR (drink = 'beer_draft' AND size_ml <> 400);

-- prices_current: the size is part of the primary key.
CREATE TABLE prices_current_new (
  venue_key TEXT NOT NULL, drink TEXT NOT NULL, hh INTEGER NOT NULL DEFAULT 0,
  cell TEXT NOT NULL, city INTEGER, price_cents INTEGER NOT NULL, observed_on TEXT NOT NULL,
  confirmations INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','quarantined','review','removed')),
  source TEXT NOT NULL CHECK (source IN ('manual','menu_photo')),
  PRIMARY KEY (venue_key, drink, hh)) WITHOUT ROWID;
INSERT INTO prices_current_new (venue_key, drink, hh, cell, city, price_cents, observed_on,
    confirmations, status, source)
  SELECT venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source
  FROM prices_current
  WHERE NOT (drink IN ('beer_bottle', 'prosecco', 'soft_drink') OR (drink = 'beer_draft' AND size_ml <> 400));
DROP TABLE prices_current;
ALTER TABLE prices_current_new RENAME TO prices_current;
CREATE INDEX pc_cell ON prices_current (cell, drink);

-- price_obs
CREATE TABLE price_obs_new (
  id INTEGER PRIMARY KEY, venue_key TEXT NOT NULL, drink TEXT NOT NULL,
  hh INTEGER NOT NULL, price_cents INTEGER NOT NULL, observed_on TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual','menu_photo')), status TEXT NOT NULL);
INSERT INTO price_obs_new (id, venue_key, drink, hh, price_cents, observed_on, source, status)
  SELECT id, venue_key, drink, hh, price_cents, observed_on, source, status FROM price_obs
  WHERE NOT (drink IN ('beer_bottle', 'prosecco', 'soft_drink') OR (drink = 'beer_draft' AND size_ml <> 400));
DROP TABLE price_obs;
ALTER TABLE price_obs_new RENAME TO price_obs;
CREATE INDEX po_venue ON price_obs (venue_key, drink);

-- reports
CREATE TABLE reports_new (id INTEGER PRIMARY KEY, venue_key TEXT NOT NULL, drink TEXT, hh INTEGER,
  reason TEXT NOT NULL CHECK (reason IN ('wrong_price','closed','not_exists','wrong_info','offensive')),
  day TEXT NOT NULL, cell TEXT);
INSERT INTO reports_new (id, venue_key, drink, hh, reason, day, cell)
  SELECT id, venue_key, drink, hh, reason, day, cell FROM reports
  -- reports about a bar have no drink (NULL): they stay
  WHERE drink IS NULL
    OR NOT (drink IN ('beer_bottle', 'prosecco', 'soft_drink') OR (drink = 'beer_draft' AND size_ml <> 400));
DROP TABLE reports;
ALTER TABLE reports_new RENAME TO reports;
CREATE INDEX rp_bar ON reports (venue_key) WHERE drink IS NULL;
