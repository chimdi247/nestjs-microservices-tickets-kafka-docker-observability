import { BadRequestException, NotFoundException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { bizMetrics } from '@app/observability';
import { KAFKA_TOPICS } from '@app/kafka';
import { TicketsServiceService } from '../../apps/tickets-service/src/tickets-service.service';
import { createDbMock } from './helpers/db-mock';

const EVENT_ID = '7f9c24e8-3b12-4d5a-9c3e-0a1b2c3d4e5f';
const USER_ID = '11111111-2222-4333-8444-555555555555';

const publishedEvent = (over: Record<string, unknown> = {}) => ({
  id: EVENT_ID,
  title: 'Jazz Night',
  status: 'PUBLISHED',
  capacity: 100,
  price: 5000,
  organizerId: 'org-1',
  date: new Date(Date.now() + 7 * 24 * 3600 * 1000),
  ...over,
});

function build(results: Parameters<typeof createDbMock>[0]) {
  const { db } = createDbMock(results);
  const kafka = { emit: jest.fn(), connect: jest.fn() };
  const http = {
    post: jest.fn(() => of({ data: { url: 'https://checkout.stripe.test/session' } })),
  };
  const service = new TicketsServiceService(
    kafka as never,
    { db } as never,
    http as never,
  );
  return { service, kafka, db, http };
}

describe('TicketsServiceService.purchase', () => {
  afterEach(() => jest.restoreAllMocks());

  it('creates a CONFIRMED ticket, emits ticket.purchased and records business metrics', async () => {
    const ticket = {
      id: 'ticket-1',
      eventId: EVENT_ID,
      userId: USER_ID,
      quantity: 2,
      totalPrice: 10000,
      status: 'CONFIRMED',
      ticketCode: 'ABC123DEF456',
      purchasedAt: new Date(),
    };
    const { service, kafka } = build({
      select: [[publishedEvent()], [{ total: 10 }], [{ email: 'buyer@example.com' }]],
      insert: [[ticket]],
    });
    const purchases = jest.spyOn(bizMetrics.ticketPurchases, 'add');
    const sold = jest.spyOn(bizMetrics.ticketsSold, 'add');
    const revenue = jest.spyOn(bizMetrics.revenueCents, 'add');

    const result = await service.purchase(
      { eventId: EVENT_ID, quantity: 2 },
      USER_ID,
    );

    expect(result.ticket).toMatchObject({
      ticketCode: 'ABC123DEF456',
      quantity: 2,
      totalPrice: 10000,
    });
    expect(kafka.emit).toHaveBeenCalledWith(
      KAFKA_TOPICS.TICKET_PURCHASED,
      expect.objectContaining({
        ticketId: 'ticket-1',
        totalPrice: 10000,
        email: 'buyer@example.com',
      }),
    );
    expect(purchases).toHaveBeenCalledWith(1);
    expect(sold).toHaveBeenCalledWith(2);
    expect(revenue).toHaveBeenCalledWith(10000);
  });

  it('rejects an unknown event and counts the failure reason', async () => {
    const { service, kafka } = build({ select: [[]] });
    const failures = jest.spyOn(bizMetrics.ticketPurchaseFailures, 'add');

    await expect(
      service.purchase({ eventId: EVENT_ID, quantity: 1 }, USER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(failures).toHaveBeenCalledWith(1, { reason: 'event_not_found' });
    expect(kafka.emit).not.toHaveBeenCalled();
  });

  it('rejects events that are not published', async () => {
    const { service } = build({
      select: [[publishedEvent({ status: 'DRAFT' })]],
    });
    const failures = jest.spyOn(bizMetrics.ticketPurchaseFailures, 'add');

    await expect(
      service.purchase({ eventId: EVENT_ID, quantity: 1 }, USER_ID),
    ).rejects.toThrow('Event is not published');
    expect(failures).toHaveBeenCalledWith(1, { reason: 'event_not_published' });
  });

  it('rejects when not enough capacity is left (sold_out)', async () => {
    const { service, kafka } = build({
      select: [[publishedEvent({ capacity: 10 })], [{ total: 9 }]],
    });
    const failures = jest.spyOn(bizMetrics.ticketPurchaseFailures, 'add');

    await expect(
      service.purchase({ eventId: EVENT_ID, quantity: 2 }, USER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(failures).toHaveBeenCalledWith(1, { reason: 'sold_out' });
    expect(kafka.emit).not.toHaveBeenCalled();
  });

  it('computes the total price as unit price x quantity', async () => {
    const { service, db } = build({
      select: [[publishedEvent({ price: 1234 })], [{ total: 0 }], [{ email: 'b@example.com' }]],
      insert: [
        [
          {
            id: 't',
            eventId: EVENT_ID,
            userId: USER_ID,
            quantity: 3,
            totalPrice: 3702,
            status: 'CONFIRMED',
            ticketCode: 'X',
            purchasedAt: new Date(),
          },
        ],
      ],
    });
    await service.purchase({ eventId: EVENT_ID, quantity: 3 }, USER_ID);

    const insertChain = (db.insert as jest.Mock).mock.results[0].value;
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ totalPrice: 3702, quantity: 3, status: 'PENDING' }),
    );
  });

  it('runs the capacity check and the insert inside one transaction (no oversell window)', async () => {
    const { service, db } = build({
      select: [[publishedEvent()], [{ total: 0 }], [{ email: 'b@example.com' }]],
      insert: [
        [
          {
            id: 't',
            eventId: EVENT_ID,
            userId: USER_ID,
            quantity: 1,
            totalPrice: 5000,
            status: 'CONFIRMED',
            ticketCode: 'X',
            purchasedAt: new Date(),
          },
        ],
      ],
    });
    await service.purchase({ eventId: EVENT_ID, quantity: 1 }, USER_ID);
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects events that have already started', async () => {
    const { service, kafka } = build({
      select: [[publishedEvent({ date: new Date(Date.now() - 1000) })]],
    });
    await expect(
      service.purchase({ eventId: EVENT_ID, quantity: 1 }, USER_ID),
    ).rejects.toThrow('Event has already started');
    expect(kafka.emit).not.toHaveBeenCalled();
  });

  describe('paid events', () => {
    const pendingTicket = {
      id: 'ticket-p',
      eventId: EVENT_ID,
      userId: USER_ID,
      quantity: 2,
      totalPrice: 10000,
      status: 'PENDING',
      ticketCode: 'PEND123456AB',
      purchasedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60000),
    };

    it('holds the seats as PENDING and returns the Stripe checkout URL (no e-mail yet)', async () => {
      const { service, kafka, http } = build({
        select: [[publishedEvent()], [{ total: 0 }]],
        insert: [[pendingTicket]],
      });
      const purchases = jest.spyOn(bizMetrics.ticketPurchases, 'add');

      const result = await service.purchase({ eventId: EVENT_ID, quantity: 2 }, USER_ID);

      expect(result.checkoutUrl).toBe('https://checkout.stripe.test/session');
      expect(result.ticket.status).toBe('PENDING');
      expect(http.post).toHaveBeenCalledWith(
        expect.stringContaining('/checkout'),
        { ticketId: 'ticket-p' },
        { headers: { 'x-user-id': USER_ID } },
      );
      // confirmation e-mail + metrics are the payments-service's job once the money arrived
      expect(kafka.emit).not.toHaveBeenCalled();
      expect(purchases).not.toHaveBeenCalled();
    });

    it('releases the seats again when the payment page cannot be created', async () => {
      const { service, db, http } = build({
        select: [[publishedEvent()], [{ total: 0 }]],
        insert: [[pendingTicket]],
        update: [[]],
      });
      http.post.mockReturnValueOnce(throwError(() => new Error('payments down')) as never);

      await expect(
        service.purchase({ eventId: EVENT_ID, quantity: 2 }, USER_ID),
      ).rejects.toBeDefined();

      const cancelChain = (db.update as jest.Mock).mock.results[0].value;
      expect(cancelChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CANCELLED' }),
      );
    });
  });

  describe('expirePendingTickets', () => {
    it('cancels unpaid bookings whose window has passed', async () => {
      const { service, db } = build({ update: [[{ id: 'a' }, { id: 'b' }]] });
      await expect(service.expirePendingTickets()).resolves.toBe(2);
      const chain = (db.update as jest.Mock).mock.results[0].value;
      expect(chain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CANCELLED' }),
      );
    });
  });
});
