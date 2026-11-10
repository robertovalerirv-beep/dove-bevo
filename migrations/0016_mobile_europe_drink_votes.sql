-- Apps-only exact recommendations for the separate European price catalogue.
-- Keep the existing 0015 table and its public vote claims untouched.
-- Claims are HMACs scoped to installation, venue, cell, drink, currency and serving.
CREATE TABLE mobile_europe_drink_votes (
  venue_key TEXT NOT NULL,
  cell TEXT NOT NULL CHECK (length(cell) = 5),
  drink TEXT NOT NULL CHECK (drink IN ('beer_draft','spritz','negroni','sbagliato','gin_tonic','gin_lemon','wine_glass','alcohol_free','water')),
  hh INTEGER NOT NULL CHECK (hh IN (0,1)),
  currency TEXT NOT NULL CHECK (currency IN ('EUR','GBP')),
  serving_key TEXT NOT NULL CHECK (length(serving_key) BETWEEN 2 AND 16),
  claim TEXT NOT NULL CHECK (length(claim) = 32 AND claim NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY (venue_key, cell, drink, hh, currency, serving_key, claim)
) WITHOUT ROWID;

CREATE INDEX mobile_europe_drink_votes_area
  ON mobile_europe_drink_votes(cell, venue_key, drink, hh, currency, serving_key);
