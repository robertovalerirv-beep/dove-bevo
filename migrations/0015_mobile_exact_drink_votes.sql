-- Apps-only recommendations for a verified drink at a verified venue.
-- The HMAC claim is specific to installation, venue and exact target. Raw
-- installation IDs, IP addresses and browser session IDs are never stored.
-- A removed or hidden source item can retain its vote for audit, but the
-- API never returns it unless that exact target is currently public again.
CREATE TABLE mobile_exact_drink_votes (
  venue_key TEXT NOT NULL,
  cell TEXT NOT NULL CHECK (length(cell) = 5),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('offer', 'customer', 'legacy')),
  target_id TEXT NOT NULL CHECK (length(target_id) BETWEEN 1 AND 128),
  claim TEXT NOT NULL CHECK (length(claim) = 32 AND claim NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY (venue_key, target_kind, target_id, claim)
) WITHOUT ROWID;

CREATE INDEX mobile_exact_drink_votes_area
  ON mobile_exact_drink_votes(cell, venue_key, target_kind, target_id);
