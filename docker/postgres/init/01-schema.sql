-- =============================================================================
-- EventFlow schema (mirrors libs/database/src/schema/*.ts - Drizzle ORM)
-- Executed once by the postgres image on first start of an EMPTY data volume.
-- To re-run: docker compose down -v && docker compose up -d
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid(), crypt(), gen_salt()

-- ---------- enums ----------
DO $$ BEGIN
  CREATE TYPE role          AS ENUM ('USER', 'ORGANIZER', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_status  AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- users ----------
CREATE TABLE IF NOT EXISTS users (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  email       varchar(255) NOT NULL,
  password    varchar(255) NOT NULL,
  name        varchar(255) NOT NULL,
  role        role         NOT NULL DEFAULT 'USER',
  created_at  timestamp    NOT NULL DEFAULT now(),
  updated_at  timestamp    NOT NULL DEFAULT now()
);
-- The Drizzle schema has no UNIQUE on email; the app only does a check-then-insert
-- (race-prone under load). A unique index makes it safe and is invisible to Drizzle.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email));

-- ---------- events ----------
-- NOTE: column is really called "organize_id" in the Drizzle schema (sic).
CREATE TABLE IF NOT EXISTS events (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  title        varchar(255)  NOT NULL,
  description  text,
  date         timestamp     NOT NULL,
  location     varchar(255)  NOT NULL,
  capacity     integer       NOT NULL,
  price        integer       NOT NULL DEFAULT 0,
  status       event_status  NOT NULL DEFAULT 'DRAFT',
  organize_id  uuid          NOT NULL REFERENCES users (id),
  created_at   timestamp     NOT NULL DEFAULT now(),
  updated_at   timestamp     NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_status_idx      ON events (status);
CREATE INDEX IF NOT EXISTS events_organize_id_idx ON events (organize_id);

-- ---------- tickets ----------
CREATE TABLE IF NOT EXISTS tickets (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid          NOT NULL REFERENCES events (id),
  user_id        uuid          NOT NULL REFERENCES users (id),
  quantity       integer       NOT NULL DEFAULT 1,
  total_price    integer       NOT NULL,
  status         ticket_status NOT NULL DEFAULT 'PENDING',
  ticket_code    varchar(20)   NOT NULL UNIQUE,
  purchased_at   timestamp     NOT NULL DEFAULT now(),
  checked_in_at  timestamp,
  created_at     timestamp     NOT NULL DEFAULT now(),
  updated_at     timestamp     NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tickets_event_status_idx ON tickets (event_id, status);
CREATE INDEX IF NOT EXISTS tickets_user_id_idx      ON tickets (user_id);
