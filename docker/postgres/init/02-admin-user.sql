-- =============================================================================
-- Seed the initial administrator account.
--   email    : admin@example.com
--   password : password123   (stored ONLY as a bcrypt hash)
--
-- The auth-service verifies passwords with bcrypt.compare(), so we must store a
-- bcrypt hash. pgcrypto's crypt(..., gen_salt('bf', 10)) produces a standard
-- "$2a$10$..." bcrypt hash that node's `bcrypt` package accepts. A fresh random
-- salt is generated every time this script runs.
-- =============================================================================
INSERT INTO users (email, password, name, role)
VALUES (
  'admin@example.com',
  crypt('password123', gen_salt('bf', 10)),
  'Admin',
  'ADMIN'
)
ON CONFLICT ((lower(email))) DO NOTHING;
