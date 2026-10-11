-- Dove bevo schema (SPEC 8). No table holds personal data. Never edit after it reaches main.

CREATE TABLE prices_current (            -- one valid price per bar, drink, size, time band
  venue_key TEXT NOT NULL, drink TEXT NOT NULL, size_ml INTEGER NOT NULL, hh INTEGER NOT NULL DEFAULT 0,
  cell TEXT NOT NULL, city INTEGER, price_cents INTEGER NOT NULL, observed_on TEXT NOT NULL,
  confirmations INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','quarantined','review','removed')),
  source TEXT NOT NULL CHECK (source IN ('manual','menu_photo')),
  PRIMARY KEY (venue_key, drink, size_ml, hh)) WITHOUT ROWID;
CREATE INDEX pc_cell ON prices_current (cell, drink);

CREATE TABLE price_obs (                 -- history, one row per contribution
  id INTEGER PRIMARY KEY, venue_key TEXT NOT NULL, drink TEXT NOT NULL, size_ml INTEGER NOT NULL,
  hh INTEGER NOT NULL, price_cents INTEGER NOT NULL, observed_on TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual','menu_photo')), status TEXT NOT NULL);
CREATE INDEX po_venue ON price_obs (venue_key, drink);

CREATE TABLE venues_user (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind INTEGER NOT NULL,
  lat REAL NOT NULL, lon REAL NOT NULL, cell TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','removed')),
  confirmations INTEGER NOT NULL DEFAULT 0);
CREATE INDEX vu_cell ON venues_user (cell, status);

CREATE TABLE reports (id INTEGER PRIMARY KEY, venue_key TEXT NOT NULL, drink TEXT, size_ml INTEGER, hh INTEGER,
  reason TEXT NOT NULL CHECK (reason IN ('wrong_price','closed','not_exists','wrong_info','offensive')), day TEXT NOT NULL);
CREATE TABLE dedup (k TEXT PRIMARY KEY, day TEXT NOT NULL) WITHOUT ROWID;   -- confirmations, reports, one-time tokens
CREATE TABLE counters (k TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (k, day)) WITHOUT ROWID;
CREATE TABLE ai_usage (day TEXT PRIMARY KEY, calls INTEGER NOT NULL, micro_eur INTEGER NOT NULL);
CREATE TABLE metrics_daily (day TEXT NOT NULL, event TEXT NOT NULL, prop TEXT NOT NULL, n INTEGER NOT NULL,
  PRIMARY KEY (day, event, prop)) WITHOUT ROWID;
