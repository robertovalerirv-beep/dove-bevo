-- OSM entries hidden by the admin (not a bar, closed): kept out of the map and of new prices.
-- The static files are regenerated at every deploy, so the decision lives here (ADR 0017).
CREATE TABLE venues_hidden (venue_key TEXT PRIMARY KEY, cell TEXT NOT NULL, name TEXT NOT NULL,
  day TEXT NOT NULL) WITHOUT ROWID;
CREATE INDEX vh_cell ON venues_hidden (cell);
