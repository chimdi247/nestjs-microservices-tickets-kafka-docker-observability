import { ADMIN, URLS, api, createPublishedEvent, eventually, registerAndLogin, uniqueEmail } from './helpers';

describe('service health (uptime probes target these)', () => {
  it.each([
    ['api-gateway', 3000],
    ['auth-service', 3001],
    ['events-service', 3003],
    ['tickets-service', 3004],
    ['notifications-service', 3006],
  ])('%s /health -> 200', async (service, port) => {
    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', service });
  });
});

describe('seeded admin account (docker/postgres/init/02-admin-user.sql)', () => {
  it('can log in with admin@example.com / password123', async () => {
    const res = await api('POST', '/auth/login', { body: ADMIN });
    expect(res.status).toBe(201);
    expect(res.data.access_token).toEqual(expect.any(String));
    expect(res.data.user).toMatchObject({ email: ADMIN.email, role: 'ADMIN' });
  });

  it('rejects a wrong password with 401', async () => {
    const res = await api('POST', '/auth/login', { body: { email: ADMIN.email, password: 'wrong-password' } });
    expect(res.status).toBe(401);
  });
});

describe('auth', () => {
  it('rejects duplicate registration with 409', async () => {
    const email = uniqueEmail('dup');
    const body = { email, password: 'Passw0rd!123', name: 'Dup' };
    expect((await api('POST', '/auth/register', { body })).status).toBe(201);
    expect((await api('POST', '/auth/register', { body })).status).toBe(409);
  });

  it('validates input (400) and protects private routes (401)', async () => {
    expect((await api('POST', '/auth/register', { body: { email: 'not-an-email', password: '1', name: '' } })).status).toBe(400);
    expect((await api('GET', '/events/my-events')).status).toBe(401);
    expect((await api('POST', '/tickets/purchase', { body: {} })).status).toBe(401);
  });

  it('returns the profile for a valid token', async () => {
    const { token, email } = await registerAndLogin('profile');
    const res = await api('GET', '/auth/profile', { token });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ email });
  });
});

describe('events + tickets business flow (gateway -> events/tickets services -> postgres via pgbouncer -> kafka)', () => {
  it('organizer publishes an event, buyer purchases and cancels a ticket', async () => {
    const organizer = await registerAndLogin('org');
    const buyer = await registerAndLogin('buyer');
    const event = await createPublishedEvent(organizer.token, { capacity: 5, price: 2000 });

    const list = await api('GET', '/events');
    expect(list.status).toBe(200);
    expect(list.data.map((e: any) => e.id)).toContain(event.id);

    const purchase = await api('POST', '/tickets/purchase', { token: buyer.token, body: { eventId: event.id, quantity: 2 } });
    expect(purchase.status).toBe(201);
    expect(purchase.data.ticket).toMatchObject({ quantity: 2, totalPrice: 4000, status: 'CONFIRMED' });

    const mine = await api('GET', '/tickets/my-tickets', { token: buyer.token });
    expect(mine.data).toHaveLength(1);

    const cancel = await api('POST', `/tickets/${purchase.data.ticket.id}/cancel`, { token: buyer.token });
    expect(cancel.status).toBe(201);
  });

  it('refuses to oversell an event', async () => {
    const organizer = await registerAndLogin('org');
    const buyer = await registerAndLogin('buyer');
    const event = await createPublishedEvent(organizer.token, { capacity: 3 });

    expect((await api('POST', '/tickets/purchase', { token: buyer.token, body: { eventId: event.id, quantity: 3 } })).status).toBe(201);
    const second = await api('POST', '/tickets/purchase', { token: buyer.token, body: { eventId: event.id, quantity: 1 } });
    expect(second.status).toBe(400);
    expect(JSON.stringify(second.body)).toContain('remaining');
  });

  it('lets only the organizer check a ticket in', async () => {
    const organizer = await registerAndLogin('org');
    const buyer = await registerAndLogin('buyer');
    const event = await createPublishedEvent(organizer.token);
    const purchase = await api('POST', '/tickets/purchase', { token: buyer.token, body: { eventId: event.id, quantity: 1 } });
    const code = purchase.data.ticket.ticketCode;

    expect((await api('POST', '/tickets/check-in', { token: buyer.token, body: { ticketCode: code } })).status).toBe(403);
    const ok = await api('POST', '/tickets/check-in', { token: organizer.token, body: { ticketCode: code } });
    expect(ok.status).toBe(201);
    expect(ok.data.ticket.status).toBe('CHECKED_IN');
  });
});

describe('async flow: Kafka -> notifications-service -> SMTP (MailHog)', () => {
  it('sends a welcome email after registration', async () => {
    const { email } = await registerAndLogin('mail');
    const message = await eventually(async () => {
      const r = await fetch(`${URLS.mailhog}/api/v2/search?kind=to&query=${encodeURIComponent(email)}`);
      const j = await r.json();
      return j.count > 0 ? j.items[0] : undefined;
    }, { what: `welcome e-mail for ${email}` });
    expect(message.Content.Headers.Subject[0]).toContain('Welcome to EventFlow');
  });
});
