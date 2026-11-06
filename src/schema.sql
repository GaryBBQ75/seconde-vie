CREATE TABLE IF NOT EXISTS organisations (
  id text PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organisations(id),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  roles text[] NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  member_id text NOT NULL REFERENCES members(id),
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS sites (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organisations(id),
  name text NOT NULL,
  kind text NOT NULL,
  UNIQUE(org_id, name)
);
CREATE TABLE IF NOT EXISTS zones (
  id text PRIMARY KEY,
  site_id text NOT NULL REFERENCES sites(id),
  name text NOT NULL,
  UNIQUE(site_id, name)
);
CREATE TABLE IF NOT EXISTS stock (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organisations(id),
  code text NOT NULL UNIQUE,
  kind text NOT NULL CHECK(kind IN ('lot','item')),
  title text NOT NULL,
  category text NOT NULL,
  state text NOT NULL CHECK(state IN ('tri','controle','pret','transit','sorti')),
  site_id text NOT NULL REFERENCES sites(id),
  zone_id text REFERENCES zones(id),
  quantity integer CHECK(quantity >= 0),
  grams integer CHECK(grams >= 0),
  price_cents integer CHECK(price_cents >= 0),
  parent_id text REFERENCES stock(id),
  condition text,
  origin text,
  note text,
  barcode text,
  exit_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(quantity IS NOT NULL OR grams IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS stock_org_state_idx ON stock(org_id, state, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_org_barcode_idx ON stock(org_id, barcode);
CREATE TABLE IF NOT EXISTS stock_events (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organisations(id),
  stock_id text NOT NULL REFERENCES stock(id),
  member_id text NOT NULL REFERENCES members(id),
  type text NOT NULL,
  detail text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_events_org_time_idx ON stock_events(org_id, created_at DESC);
CREATE TABLE IF NOT EXISTS transfers (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organisations(id),
  origin_id text NOT NULL REFERENCES sites(id),
  destination_id text NOT NULL REFERENCES sites(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(origin_id <> destination_id)
);
CREATE TABLE IF NOT EXISTS transfer_lines (
  transfer_id text NOT NULL REFERENCES transfers(id),
  stock_id text NOT NULL REFERENCES stock(id),
  prior_state text NOT NULL,
  received_at timestamptz,
  PRIMARY KEY(transfer_id, stock_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS transit_once_idx ON transfer_lines(stock_id) WHERE received_at IS NULL;
CREATE TABLE IF NOT EXISTS photos (
  stock_id text PRIMARY KEY REFERENCES stock(id),
  mime_type text NOT NULL,
  content bytea NOT NULL
);
CREATE TABLE IF NOT EXISTS shifts (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organisations(id),
  member_id text NOT NULL REFERENCES members(id),
  site_id text NOT NULL REFERENCES sites(id),
  activity text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  CHECK(ends_at > starts_at)
);
