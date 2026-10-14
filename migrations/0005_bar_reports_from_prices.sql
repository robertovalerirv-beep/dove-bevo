-- "Closed", "not existing" and "wrong name" sent from a price row were stored as reports on the
-- price, so the admin's bar queue (drink IS NULL) never showed them. They are about the bar:
-- move the old rows to the bar queue (the Worker now stores new ones that way).
UPDATE reports SET drink = NULL, size_ml = NULL, hh = NULL
WHERE drink IS NOT NULL AND reason IN ('closed', 'not_exists', 'wrong_info');
