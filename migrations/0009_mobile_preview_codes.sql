-- Isolated preview only. No device, session, IP or location identifiers.
CREATE TABLE mobile_auth_codes (
  code_hash TEXT PRIMARY KEY,
  challenge_hash TEXT NOT NULL,
  nonce_hash TEXT NOT NULL,
  audience TEXT NOT NULL,
  callback TEXT NOT NULL,
  environment TEXT NOT NULL,
  expires_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX mobile_auth_expiry ON mobile_auth_codes (expires_at);
CREATE INDEX mobile_auth_environment ON mobile_auth_codes (environment);
