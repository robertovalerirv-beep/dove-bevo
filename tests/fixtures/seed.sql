-- Local/e2e prices on real fixture bars near the Duomo (cell u0nd9). Idempotent.
DELETE FROM prices_current;
DELETE FROM price_obs;
DELETE FROM venues_user;
DELETE FROM counters;
DELETE FROM dedup;
DELETE FROM reports;
INSERT INTO prices_current (venue_key, drink, size_ml, hh, cell, city, price_cents, observed_on, confirmations, status, source) VALUES
  ('n2420779240',  'spritz',     0,   0, 'u0nd9', 62505581,  750, date('now', '-3 days'),  3, 'active',      'manual'),
  ('n2420779240',  'beer_draft', 400, 0, 'u0nd9', 62505581,  600, date('now', '-3 days'),  0, 'active',      'manual'),
  ('n13001337602', 'spritz',     0,   0, 'u0nd9', 62505581, 1200, date('now', '-10 days'), 1, 'active',      'manual'),
  ('n13001337602', 'beer_draft', 400, 0, 'u0nd9', 62505581,  900, date('now', '-10 days'), 0, 'active',      'manual'),
  ('n5471678323',  'spritz',     0,   1, 'u0nd9', 62505581, 1000, date('now', '-1 days'),  0, 'active',      'manual'),
  ('w549495264',   'gin_tonic',  0,   0, 'u0nd9', 62505581, 2000, date('now', '-2 days'),  0, 'quarantined', 'manual'),
  ('n7953838530',  'spritz',     0,   0, 'u0nd9', 62505581,  800, date('now', '-2 days'),  0, 'review',      'manual');
INSERT INTO price_obs (venue_key, drink, size_ml, hh, price_cents, observed_on, source, status) VALUES
  ('n2420779240', 'spritz', 0, 0, 700, date('now', '-40 days'), 'manual', 'active'),
  ('n2420779240', 'spritz', 0, 0, 750, date('now', '-3 days'),  'manual', 'active');
