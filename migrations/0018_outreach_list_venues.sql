-- Coverage of the first outreach list (Milan, 2026-11-25): bars that exist but are not in the OSM import
-- (OSM tags them restaurant, arts_centre, hostel…, or the node is newer than the import) are added as
-- approved user bars, exactly what the admin's "add a bar" does (addApprovedVenue). Idempotent: a bar with
-- the same name in the same cell is not added twice. No prices, no manager data.
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Dry', 1, 45.47906, 9.18843, 'u0nd9', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Dry' AND cell = 'u0nd9' AND lat = 45.47906 AND lon = 9.18843);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'El Brellin', 1, 45.45188, 9.17472, 'u0nd8', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'El Brellin' AND cell = 'u0nd8' AND lat = 45.45188 AND lon = 9.17472);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Fioraio Bianchi Caffè', 0, 45.47532, 9.18925, 'u0nd9', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Fioraio Bianchi Caffè' AND cell = 'u0nd9' AND lat = 45.47532 AND lon = 9.18925);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Flores Cócteles', 1, 45.46292, 9.188, 'u0nd9', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Flores Cócteles' AND cell = 'u0nd9' AND lat = 45.46292 AND lon = 9.188);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Jamaica', 1, 45.4726, 9.18754, 'u0nd9', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Jamaica' AND cell = 'u0nd9' AND lat = 45.4726 AND lon = 9.18754);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Le Biciclette', 1, 45.45784, 9.1772, 'u0nd8', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Le Biciclette' AND cell = 'u0nd8' AND lat = 45.45784 AND lon = 9.1772);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Lubar', 1, 45.47266, 9.20012, 'u0nd9', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Lubar' AND cell = 'u0nd9' AND lat = 45.47266 AND lon = 9.20012);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Lubna', 1, 45.44115, 9.20524, 'u0nd9', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Lubna' AND cell = 'u0nd9' AND lat = 45.44115 AND lon = 9.20524);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Moebius', 1, 45.48143, 9.20287, 'u0nd9', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Moebius' AND cell = 'u0nd9' AND lat = 45.48143 AND lon = 9.20287);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Pandenus', 0, 45.48298, 9.19237, 'u0nd9', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Pandenus' AND cell = 'u0nd9' AND lat = 45.48298 AND lon = 9.19237);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Pandenus', 0, 45.47769, 9.20623, 'u0nd9', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Pandenus' AND cell = 'u0nd9' AND lat = 45.47769 AND lon = 9.20623);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Pandenus', 0, 45.47131, 9.18435, 'u0nd8', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Pandenus' AND cell = 'u0nd8' AND lat = 45.47131 AND lon = 9.18435);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Rob de Matt', 1, 45.4987, 9.17487, 'u0ndb', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Rob de Matt' AND cell = 'u0ndb' AND lat = 45.4987 AND lon = 9.17487);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Spirit de Milan', 1, 45.50671, 9.15847, 'u0ndb', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Spirit de Milan' AND cell = 'u0ndb' AND lat = 45.50671 AND lon = 9.15847);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'The Spirit', 1, 45.44947, 9.20526, 'u0nd9', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'The Spirit' AND cell = 'u0nd9' AND lat = 45.44947 AND lon = 9.20526);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Upcycle Bike Café', 1, 45.48372, 9.22627, 'u0ndc', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Upcycle Bike Café' AND cell = 'u0ndc' AND lat = 45.48372 AND lon = 9.22627);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Roialto', 1, 45.4317, 9.17298, 'u0nd2', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Roialto' AND cell = 'u0nd2' AND lat = 45.4317 AND lon = 9.17298);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Birrificio Milano', 2, 45.45806, 9.24978, 'u0ndd', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Birrificio Milano' AND cell = 'u0ndd' AND lat = 45.45806 AND lon = 9.24978);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Clèr Rooftop', 1, 45.49853, 9.12922, 'u0n6z', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Clèr Rooftop' AND cell = 'u0n6z' AND lat = 45.49853 AND lon = 9.12922);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Orizzonti Rooftop', 1, 45.45747, 9.19194, 'u0nd9', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Orizzonti Rooftop' AND cell = 'u0nd9' AND lat = 45.45747 AND lon = 9.19194);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Terrazza Triennale', 1, 45.47223, 9.17414, 'u0nd8', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Terrazza Triennale' AND cell = 'u0nd8' AND lat = 45.47223 AND lon = 9.17414);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'VIU Terrace', 1, 45.48329, 9.17757, 'u0nd8', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'VIU Terrace' AND cell = 'u0nd8' AND lat = 45.48329 AND lon = 9.17757);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Arci Magnolia', 4, 45.4637, 9.28608, 'u0nde', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Arci Magnolia' AND cell = 'u0nde' AND lat = 45.4637 AND lon = 9.28608);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Base', 4, 45.45311, 9.16365, 'u0nd8', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Base' AND cell = 'u0nd8' AND lat = 45.45311 AND lon = 9.16365);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Circolo Ohibò', 4, 45.5016, 9.23586, 'u0ndf', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Circolo Ohibò' AND cell = 'u0ndf' AND lat = 45.5016 AND lon = 9.23586);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Cuccagna', 1, 45.45119, 9.21158, 'u0nd9', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Cuccagna' AND cell = 'u0nd9' AND lat = 45.45119 AND lon = 9.21158);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Mare Culturale Urbano', 4, 45.46875, 9.12403, 'u0n6x', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Mare Culturale Urbano' AND cell = 'u0n6x' AND lat = 45.46875 AND lon = 9.12403);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Masada', 4, 45.49955, 9.14061, 'u0n6z', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Masada' AND cell = 'u0n6z' AND lat = 45.49955 AND lon = 9.14061);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Ostello Bello', 1, 45.46069, 9.18111, 'u0nd8', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Ostello Bello' AND cell = 'u0nd8' AND lat = 45.46069 AND lon = 9.18111);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'California Bakery', 0, 45.45218, 9.19635, 'u0nd9', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'California Bakery' AND cell = 'u0nd9' AND lat = 45.45218 AND lon = 9.19635);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'California Bakery', 0, 45.46693, 9.20736, 'u0nd9', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'California Bakery' AND cell = 'u0nd9' AND lat = 45.46693 AND lon = 9.20736);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'California Bakery', 0, 45.47278, 9.20675, 'u0nd9', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'California Bakery' AND cell = 'u0nd9' AND lat = 45.47278 AND lon = 9.20675);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Taveggia', 0, 45.4633, 9.19905, 'u0nd9', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Taveggia' AND cell = 'u0nd9' AND lat = 45.4633 AND lon = 9.19905);
INSERT INTO venues_user (name, kind, lat, lon, cell, status) SELECT 'Cova Montenapoleone', 0, 45.46885, 9.195, 'u0nd9', 'approved'
  WHERE NOT EXISTS (SELECT 1 FROM venues_user WHERE name = 'Cova Montenapoleone' AND cell = 'u0nd9' AND lat = 45.46885 AND lon = 9.195);
-- A stored cell answer would miss the new bars (ADR 0020, 0032): empty those cells.
DELETE FROM cell_snapshot WHERE cell IN ('u0nd9', 'u0nd8', 'u0ndb', 'u0ndc', 'u0nd2', 'u0ndd', 'u0n6z', 'u0nde', 'u0ndf', 'u0n6x');
