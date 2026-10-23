import { BadRequestException, NotFoundException } from '@nestjs/common';
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
  ...over,
});

function build(results: Parameters<typeof createDbMock>[0]) {
  const { db } = createDbMock(results);
  const kafka = { emit: jest.fn(), connect: jest.fn() };
  const service = new TicketsServiceService(kafka as never, { db } as never);
  return { service, kafka, db };
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
      select: [[publishedEvent()], [{ total: 10 }]],
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
      expect.objectContaining({ ticketId: 'ticket-1', totalPrice: 10000 }),
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
      select: [[publishedEvent({ price: 1234 })], [{ total: 0 }]],
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
      expect.objectContaining({ totalPrice: 3702, quantity: 3, status: 'CONFIRMED' }),
    );
  });
});
