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
  -- Five wine prices make a median (D-12): 4,00 is Affare, 9,00 is Salato, the others Giusto.
  ('n10081337586', 'wine_glass', 150, 0, 'u0nd9', 62505581,  400, date('now', '-4 days'),  0, 'active',      'manual'),
  ('n11755824793', 'wine_glass', 150, 0, 'u0nd9', 62505581,  450, date('now', '-4 days'),  0, 'active',      'manual'),
  ('n12258055483', 'wine_glass', 150, 0, 'u0nd9', 62505581,  500, date('now', '-4 days'),  0, 'active',      'manual'),
  ('n4610306152',  'wine_glass', 150, 0, 'u0nd9', 62505581,  550, date('now', '-4 days'),  0, 'active',      'manual'),
  ('n9888148629',  'wine_glass', 150, 0, 'u0nd9', 62505581,  900, date('now', '-4 days'),  0, 'active',      'manual'),
  -- A price older than 90 days: "da confermare" (M4-05).
  ('n11755824793', 'prosecco',   150, 0, 'u0nd9', 62505581,  600, date('now', '-120 days'), 0, 'active',     'manual'),
  ('w549495264',   'gin_tonic',  0,   0, 'u0nd9', 62505581, 2000, date('now', '-2 days'),  0, 'quarantined', 'manual'),
  ('n7953838530',  'spritz',     0,   0, 'u0nd9', 62505581,  800, date('now', '-2 days'),  0, 'review',      'manual');
INSERT INTO price_obs (venue_key, drink, size_ml, hh, price_cents, observed_on, source, status) VALUES
  ('n2420779240', 'spritz', 0, 0, 700, date('now', '-40 days'), 'manual', 'active'),
  ('n2420779240', 'spritz', 0, 0, 750, date('now', '-3 days'),  'manual', 'active');
