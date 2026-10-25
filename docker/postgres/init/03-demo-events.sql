-- =============================================================================
-- Demo catalogue so the web client shows events right after the first start.
-- Owned by the seeded admin account; dates are relative to the moment of the
-- first start. Prices are in cents. Only runs on an EMPTY data volume
-- (create more events from the "Organizer" area of the web client).
-- =============================================================================
INSERT INTO events (title, description, date, location, capacity, price, status, organize_id)
SELECT v.title, v.description, now() + v.in_days, v.location, v.capacity, v.price, 'PUBLISHED', u.id
FROM users u
CROSS JOIN (VALUES
  ('Jazz Night at the Harbor',
   'An evening of live jazz with three local quartets, right on the waterfront.',
   interval '12 days 19 hours', 'Harbor Hall, Rotterdam', 120, 2500),
  ('Kyiv Tech Meetup: Event-Driven Systems',
   'Talks and lightning demos on Kafka, outbox patterns and keeping data consistent across services.',
   interval '20 days 17 hours', 'UNIT.City, Kyiv', 200, 0),
  ('Open-Air Cinema: Classics Under the Stars',
   'Bring a blanket. Two classic films, popcorn included with every ticket.',
   interval '30 days 20 hours', 'Riverside Park', 300, 1200),
  ('Startup Pitch Night',
   'Ten founders, five minutes each, one winner chosen by the audience.',
   interval '45 days 18 hours', 'Innovation Hub, Lagos', 80, 1500)
) AS v(title, description, in_days, location, capacity, price)
WHERE u.email = 'admin@example.com'
  AND NOT EXISTS (SELECT 1 FROM events);
