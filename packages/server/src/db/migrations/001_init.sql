-- Contrail schema. Statements between the timescale:begin/end markers are skipped on plain PostgreSQL.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS positions (
  ts          timestamptz NOT NULL,
  hex         char(6)     NOT NULL,
  callsign    varchar(10),
  lat         real        NOT NULL,
  lon         real        NOT NULL,
  alt_baro    integer,
  alt_geom    integer,
  gs          smallint,
  track       smallint,
  vr          smallint,
  squawk      char(4),
  on_ground   boolean     NOT NULL DEFAULT false,
  source      smallint    NOT NULL DEFAULT 0,
  feed        varchar(16)
);

-- timescale:begin
SELECT create_hypertable('positions', 'ts', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 hour');
ALTER TABLE positions SET (timescaledb.compress, timescaledb.compress_segmentby = 'hex', timescaledb.compress_orderby = 'ts DESC');
SELECT add_compression_policy('positions', INTERVAL '6 hours', if_not_exists => TRUE);
SELECT add_retention_policy('positions', INTERVAL '${RETENTION_DAYS} days', if_not_exists => TRUE);
-- timescale:end

CREATE INDEX IF NOT EXISTS positions_hex_ts_idx ON positions (hex, ts DESC);
CREATE INDEX IF NOT EXISTS positions_ts_idx ON positions (ts DESC);

CREATE TABLE IF NOT EXISTS flights (
  id              bigserial PRIMARY KEY,
  hex             char(6)     NOT NULL,
  callsign        varchar(10),
  flight_no       varchar(10),
  reg             varchar(12),
  type            varchar(6),
  operator        varchar(4),
  category        varchar(12),
  first_seen      timestamptz NOT NULL,
  last_seen       timestamptz NOT NULL,
  origin          char(4),
  dest            char(4),
  first_lat       real,
  first_lon       real,
  last_lat        real,
  last_lon        real,
  max_alt         integer,
  ground_start    boolean,
  ground_end      boolean,
  position_count  integer NOT NULL DEFAULT 0,
  closed          boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS flights_hex_idx ON flights (hex, last_seen DESC);
CREATE INDEX IF NOT EXISTS flights_callsign_idx ON flights (callsign, last_seen DESC);
CREATE INDEX IF NOT EXISTS flights_reg_idx ON flights (reg, last_seen DESC);
CREATE INDEX IF NOT EXISTS flights_flight_no_idx ON flights (flight_no, last_seen DESC);
CREATE INDEX IF NOT EXISTS flights_open_idx ON flights (hex) WHERE closed = false;

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name  text,
  settings      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       varchar(16) NOT NULL,
  label      text NOT NULL,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookmarks_user_idx ON bookmarks (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS saved_filters (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  spec       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          varchar(16) NOT NULL,
  subject       text NOT NULL,
  channels      text[] NOT NULL DEFAULT '{push}',
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_fired_at timestamptz
);
CREATE INDEX IF NOT EXISTS alert_rules_user_idx ON alert_rules (user_id);
CREATE INDEX IF NOT EXISTS alert_rules_subject_idx ON alert_rules (upper(subject)) WHERE enabled;

CREATE TABLE IF NOT EXISTS alert_events (
  id       bigserial PRIMARY KEY,
  rule_id  uuid REFERENCES alert_rules(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fired_at timestamptz NOT NULL DEFAULT now(),
  title    text NOT NULL,
  body     text NOT NULL,
  payload  jsonb NOT NULL DEFAULT '{}'::jsonb,
  read     boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS alert_events_user_idx ON alert_events (user_id, fired_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  keys       jsonb NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_cache (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS api_cache_expires_idx ON api_cache (expires_at);

CREATE TABLE IF NOT EXISTS stats_samples (
  ts            timestamptz PRIMARY KEY,
  total         integer NOT NULL,
  airborne      integer NOT NULL,
  on_ground     integer NOT NULL,
  by_source     jsonb NOT NULL DEFAULT '{}'::jsonb,
  by_category   jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_airlines  jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_airports  jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS airport_delay_samples (
  ts          timestamptz NOT NULL,
  icao        char(4) NOT NULL,
  delay_index real NOT NULL,
  avg_delay   real NOT NULL,
  cancelled   integer NOT NULL DEFAULT 0,
  sampled     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (ts, icao)
);
