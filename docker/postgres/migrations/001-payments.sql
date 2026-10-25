-- =============================================================================
-- Migration 001: Stripe payments.
-- Applied automatically by the `db-migrate` service in docker-compose.yaml on every start
-- (databases created before the payments feature need it; the init scripts only run on an EMPTY
-- volume). Idempotent: safe to run any number of times. Add future migrations as 002-*.sql, ...
-- =============================================================================
BEGIN;
-- ---------- payments (Stripe) ----------
DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- a PENDING ticket (awaiting payment) holds its seats until this moment
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS expires_at timestamp;
CREATE INDEX IF NOT EXISTS tickets_pending_expiry_idx ON tickets (expires_at) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS payments (
  id                        uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id                 uuid           NOT NULL REFERENCES tickets (id),
  user_id                   uuid           NOT NULL REFERENCES users (id),
  amount                    integer        NOT NULL,            -- cents
  currency                  varchar(3)     NOT NULL DEFAULT 'usd',
  status                    payment_status NOT NULL DEFAULT 'PENDING',
  stripe_session_id         varchar(255)   UNIQUE,
  stripe_payment_intent_id  varchar(255),
  stripe_refund_id          varchar(255),
  created_at                timestamp      NOT NULL DEFAULT now(),
  updated_at                timestamp      NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_ticket_id_idx ON payments (ticket_id);
CREATE INDEX IF NOT EXISTS payments_status_idx    ON payments (status);
CREATE INDEX IF NOT EXISTS payments_intent_idx    ON payments (stripe_payment_intent_id);

CREATE TABLE IF NOT EXISTS processed_stripe_events (
  id            varchar(255) PRIMARY KEY,
  type          varchar(100) NOT NULL,
  processed_at  timestamp    NOT NULL DEFAULT now()
);

COMMIT;
