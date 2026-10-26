-- Public content/day references only. No actor identifiers or copies of dedup markers.
CREATE TABLE contribution_restrictions (
  family TEXT NOT NULL CHECK (family IN ('price', 'proposal')),
  target TEXT NOT NULL,
  day TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (family, target, day)
) WITHOUT ROWID;
CREATE INDEX contribution_restrictions_expiry ON contribution_restrictions(expires_at);
