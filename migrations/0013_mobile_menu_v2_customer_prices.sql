-- Apps-only customer observations for vetted mobile menu registry venues.
-- Menu source facts in 0011 and website/legacy EUR tables are untouched.
CREATE TABLE mobile_menu_v2_customer_entries (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE CHECK (length(id) = 36),
  venue_key TEXT NOT NULL,
  cell TEXT NOT NULL CHECK (length(cell) = 5),
  item_key TEXT NOT NULL CHECK (length(item_key) = 65 AND substr(item_key,1,1) IN ('o','c') AND substr(item_key,2) NOT GLOB '*[^0-9a-f]*'),
  item_kind TEXT NOT NULL CHECK (item_kind IN ('menu_offer','new_drink')),
  offer_id TEXT,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 512),
  category TEXT CHECK (category IN (
    'beer_draft','spritz','negroni','sbagliato','gin_tonic','gin_lemon',
    'wine_glass','alcohol_free','water'
  )),
  serving_label TEXT CHECK (serving_label IS NULL OR length(serving_label) BETWEEN 1 AND 256),
  serving_ml INTEGER CHECK (serving_ml IS NULL OR serving_ml BETWEEN 1 AND 100000),
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor)='integer' AND amount_minor BETWEEN 1 AND 100000),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  currency_exponent INTEGER NOT NULL CHECK (currency_exponent BETWEEN 0 AND 3),
  price_scope TEXT NOT NULL DEFAULT 'drink_item' CHECK (price_scope='drink_item'),
  source_kind TEXT NOT NULL DEFAULT 'customer' CHECK (source_kind='customer'),
  observed_on TEXT NOT NULL CHECK (length(observed_on)=10),
  status TEXT NOT NULL CHECK (status IN ('active','pending','review','removed')),
  previous_revision TEXT,
  changed_at TEXT NOT NULL,
  moderated_at TEXT,
  CHECK ((item_kind='menu_offer' AND offer_id IS NOT NULL) OR
         (item_kind='new_drink' AND offer_id IS NULL)),
  FOREIGN KEY (venue_key) REFERENCES mobile_menu_v2_venues(venue_key),
  FOREIGN KEY (offer_id) REFERENCES mobile_menu_v2_offers(id)
);
CREATE INDEX mobile_menu_v2_customer_item
  ON mobile_menu_v2_customer_entries(venue_key,cell,item_key,seq DESC);
CREATE INDEX mobile_menu_v2_customer_pending
  ON mobile_menu_v2_customer_entries(status,changed_at,id);
CREATE UNIQUE INDEX mobile_menu_v2_one_pending_new_drink
  ON mobile_menu_v2_customer_entries(venue_key,item_key)
  WHERE status='pending';
CREATE TRIGGER mobile_menu_v2_customer_fact_immutable BEFORE UPDATE OF
  venue_key,cell,item_key,item_kind,offer_id,name,category,serving_label,
  serving_ml,amount_minor,currency,currency_exponent,price_scope,source_kind,
  observed_on,previous_revision,changed_at
ON mobile_menu_v2_customer_entries
BEGIN SELECT RAISE(ABORT,'customer observation facts are immutable'); END;

CREATE TABLE mobile_menu_v2_customer_reports (
  id INTEGER PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES mobile_menu_v2_customer_entries(id),
  reason TEXT NOT NULL CHECK (reason IN ('wrong_price','spam')),
  day TEXT NOT NULL CHECK (length(day)=10)
);
CREATE INDEX mobile_menu_v2_customer_reports_entry
  ON mobile_menu_v2_customer_reports(entry_id);

CREATE TABLE mobile_menu_v2_customer_decisions (
  id INTEGER PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES mobile_menu_v2_customer_entries(id),
  decision TEXT NOT NULL CHECK (decision IN ('approve','remove')),
  decided_at TEXT NOT NULL
);
CREATE INDEX mobile_menu_v2_customer_decisions_entry
  ON mobile_menu_v2_customer_decisions(entry_id);

CREATE TRIGGER mobile_menu_v2_customer_decision_audit AFTER UPDATE OF status
ON mobile_menu_v2_customer_entries
WHEN OLD.status <> NEW.status AND NEW.status IN ('active','removed')
BEGIN
  INSERT INTO mobile_menu_v2_customer_decisions(entry_id,decision,decided_at)
  VALUES (NEW.id,CASE WHEN NEW.status='active' THEN 'approve' ELSE 'remove' END,NEW.moderated_at);
END;
