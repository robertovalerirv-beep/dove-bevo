-- Accept stable canonical OSM-node evidence for owner-verified Italian venues.
-- D1 keeps foreign keys enforced; defer checks during this same-transaction table rebuild.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE mobile_menu_v2_venues_rebuild (
  venue_key TEXT PRIMARY KEY,
  cell TEXT NOT NULL CHECK (length(cell) = 5),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 512),
  kind INTEGER NOT NULL CHECK (kind BETWEEN 0 AND 4),
  lat REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon REAL NOT NULL CHECK (lon BETWEEN -180 AND 180),
  address TEXT,
  city TEXT NOT NULL CHECK (length(city) BETWEEN 2 AND 200),
  country TEXT NOT NULL CHECK (country GLOB '[A-Z][A-Z]'),
  identity_kind TEXT NOT NULL CHECK (identity_kind IN ('osm','owner_verified')),
  identity_url TEXT NOT NULL CHECK (identity_url LIKE 'https://%'),
  identity_text_sha256 TEXT,
  identity_geo_url TEXT,
  identity_geo_text_sha256 TEXT,
  identity_geo_hash_basis TEXT CHECK (identity_geo_hash_basis IN ('raw_utf8','html_text_v1','osm_node_v1')),
  identity_fingerprint TEXT,
  identity_checked_on TEXT NOT NULL CHECK (length(identity_checked_on) = 10),
  CHECK (
    (identity_kind = 'osm' AND country <> 'IT' AND identity_fingerprint IS NULL
      AND identity_url LIKE 'https://www.openstreetmap.org/%'
      AND identity_text_sha256 IS NULL AND identity_geo_url IS NULL
      AND identity_geo_text_sha256 IS NULL AND identity_geo_hash_basis IS NULL
      AND substr(venue_key,1,1) IN ('n','w','r')
      AND length(venue_key) BETWEEN 2 AND 16
      AND substr(venue_key,2,1) BETWEEN '1' AND '9'
      AND substr(venue_key,2) NOT GLOB '*[^0-9]*')
    OR
    (identity_kind = 'owner_verified' AND country = 'IT'
      AND identity_fingerprint IS NOT NULL
      AND identity_url NOT LIKE 'https://www.openstreetmap.org/%'
      AND identity_text_sha256 IS NOT NULL AND length(identity_text_sha256) = 64
      AND identity_text_sha256 NOT GLOB '*[^0-9a-f]*'
      AND identity_geo_url IS NOT NULL AND identity_geo_url LIKE 'https://%'
      AND identity_geo_text_sha256 IS NOT NULL
      AND length(identity_geo_text_sha256) = 64
      AND identity_geo_text_sha256 NOT GLOB '*[^0-9a-f]*'
      AND identity_geo_hash_basis IS NOT NULL
      AND venue_key = ('m' || substr(identity_fingerprint,1,24))
      AND length(identity_fingerprint) = 64
      AND identity_fingerprint NOT GLOB '*[^0-9a-f]*'
      AND address IS NOT NULL AND length(address) BETWEEN 3 AND 500
      AND lat BETWEEN 35.2 AND 47.2 AND lon BETWEEN 6.5 AND 18.6)
  )
) WITHOUT ROWID;
INSERT INTO mobile_menu_v2_venues_rebuild (venue_key,cell,name,kind,lat,lon,address,city,country,identity_kind,identity_url,identity_text_sha256,identity_geo_url,identity_geo_text_sha256,identity_geo_hash_basis,identity_fingerprint,identity_checked_on) SELECT venue_key,cell,name,kind,lat,lon,address,city,country,identity_kind,identity_url,identity_text_sha256,identity_geo_url,identity_geo_text_sha256,identity_geo_hash_basis,identity_fingerprint,identity_checked_on FROM mobile_menu_v2_venues;
DROP TABLE mobile_menu_v2_venues;
ALTER TABLE mobile_menu_v2_venues_rebuild RENAME TO mobile_menu_v2_venues;
CREATE INDEX mobile_menu_v2_venues_cell ON mobile_menu_v2_venues(cell, venue_key);
CREATE UNIQUE INDEX mobile_menu_v2_owner_fingerprint
  ON mobile_menu_v2_venues(identity_fingerprint) WHERE identity_fingerprint IS NOT NULL;
