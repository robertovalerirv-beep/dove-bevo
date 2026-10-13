-- Bar reports ("closed", "not_exists", …) are decided by the admin, who needs the bar's cell to
-- hide it. Older rows have no cell: the admin page falls back to the cell of the bar's prices.
ALTER TABLE reports ADD COLUMN cell TEXT;
CREATE INDEX rp_bar ON reports (venue_key) WHERE drink IS NULL;
