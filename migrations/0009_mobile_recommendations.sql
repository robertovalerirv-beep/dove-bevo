-- Apps-only public recommendations. Persistent pair-scoped HMACs, never installation IDs or IPs.
-- Kept until undo/service withdrawal; intentionally outside the day-salted dedup cleanup.
-- The primary key indexes both the per-venue snapshot and the unique installation/pair claim.
CREATE TABLE mobile_recommendations (
  venue_key TEXT NOT NULL,
  drink TEXT NOT NULL CHECK (drink IN (
    'beer_draft', 'spritz', 'negroni', 'sbagliato', 'gin_tonic',
    'gin_lemon', 'wine_glass', 'alcohol_free', 'water'
  )),
  claim TEXT NOT NULL CHECK (length(claim) = 32 AND claim NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY (venue_key, drink, claim)
) WITHOUT ROWID;
