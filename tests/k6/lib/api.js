import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { BASE_URL } from './config.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function params(token, name) {
  const headers = { ...JSON_HEADERS };
  if (token) headers.Authorization = `Bearer ${token}`;
  return { headers, tags: { name } }; // `name` tag keeps metric cardinality low (no ids in labels)
}

// Every gateway response is wrapped as { success, data, meta } by TransformInterceptor.
const data = (res) => {
  try { return res.json('data'); } catch (_) { return undefined; }
};

export function register(email, password, name, role) {
  return http.post(`${BASE_URL}/auth/register`, JSON.stringify(role ? { email, password, name, role } : { email, password, name }), params(null, 'POST /auth/register'));
}

export function login(email, password) {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email, password }), params(null, 'POST /auth/login'));
  return { res, token: data(res)?.access_token };
}

/**
 * Runs once before the test: creates an organizer with a huge published event, and a buyer.
 * Returns the tokens + event id handed to every VU.
 */
export function bootstrap() {
  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const password = 'k6-password-123';

  const orgEmail = `k6-org-${run}@example.com`;
  const buyerEmail = `k6-buyer-${run}@example.com`;
  for (const [email, name, role] of [[orgEmail, 'k6 organizer', 'ORGANIZER'], [buyerEmail, 'k6 buyer', undefined]]) {
    const r = register(email, password, name, role);
    if (r.status !== 201) throw new Error(`register failed: ${r.status} ${r.body}`);
  }
  const org = login(orgEmail, password);
  const buyer = login(buyerEmail, password);
  if (!org.token || !buyer.token) throw new Error('login failed in setup (throttling? use tests/docker-compose.tests.yaml)');

  const ev = http.post(`${BASE_URL}/events`, JSON.stringify({
    title: `k6 event ${run}`, description: 'load test event', date: '2030-01-01T18:00:00.000Z',
    location: 'k6 arena', capacity: 100000000, price: 0, // free: load tests must not call Stripe
  }), params(org.token, 'POST /events'));
  const eventId = data(ev)?.id;
  if (!eventId) throw new Error(`create event failed: ${ev.status} ${ev.body}`);
  const pub = http.post(`${BASE_URL}/events/${eventId}/publish`, null, params(org.token, 'POST /events/:id/publish'));
  if (pub.status !== 201 && pub.status !== 200) throw new Error(`publish failed: ${pub.status} ${pub.body}`);

  return { buyerToken: buyer.token, orgToken: org.token, eventId };
}

/** One realistic user iteration: 70% browse, 20% buy, 10% look at own tickets. */
export function userJourney({ buyerToken, eventId }) {
  const roll = Math.random();

  if (roll < 0.7) {
    group('browse events', () => {
      const list = http.get(`${BASE_URL}/events`, params(null, 'GET /events'));
      check(list, { 'list events 200': (r) => r.status === 200 });
      const one = http.get(`${BASE_URL}/events/${eventId}`, params(null, 'GET /events/:id'));
      check(one, { 'get event 200': (r) => r.status === 200 });
    });
  } else if (roll < 0.9) {
    group('purchase ticket', () => {
      const res = http.post(`${BASE_URL}/tickets/purchase`, JSON.stringify({ eventId, quantity: 1 }),
        params(buyerToken, 'POST /tickets/purchase'));
      check(res, {
        'purchase 201': (r) => r.status === 201,
        'purchase returns ticket code': (r) => !!data(r)?.ticket?.ticketCode,
      });
    });
  } else {
    group('my tickets', () => {
      const res = http.get(`${BASE_URL}/tickets/my-tickets`, params(buyerToken, 'GET /tickets/my-tickets'));
      check(res, { 'my-tickets 200': (r) => r.status === 200 });
    });
  }
  sleep(Math.random() * 1.5 + 0.5); // think time
}
