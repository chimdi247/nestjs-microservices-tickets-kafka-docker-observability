import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { KAFKA_TOPICS } from '@app/kafka';
import { PaymentsServiceService } from '../../apps/payments-service/src/payments-service.service';
import { createDbMock } from './helpers/db-mock';

const TICKET_ID = '7f9c24e8-3b12-4d5a-9c3e-0a1b2c3d4e5f';

function build(results: Parameters<typeof createDbMock>[0], stripeEvent?: unknown) {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  const { db } = createDbMock(results);
  const kafka = { emit: jest.fn(), connect: jest.fn() };
  const service = new PaymentsServiceService(kafka as never, { db } as never);
  // inject a fake Stripe client (the real one is created from STRIPE_SECRET_KEY)
  (service as unknown as { stripe: unknown }).stripe = {
    webhooks: {
      constructEvent: jest.fn(() => {
        if (!stripeEvent) throw new Error('bad signature');
        return stripeEvent;
      }),
    },
  };
  return { service, kafka, db };
}

const paidSession = (over: Record<string, unknown> = {}) => ({
  id: 'evt_1',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_1',
      payment_status: 'paid',
      payment_intent: 'pi_1',
      ...over,
    },
  },
});

describe('PaymentsServiceService.handleWebhook', () => {
  afterEach(() => jest.restoreAllMocks());

  it('rejects a webhook with an invalid signature', async () => {
    const { service } = build({});
    await expect(service.handleWebhook(Buffer.from('{}'), 'bad')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('answers 503 when Stripe is not configured', async () => {
    const { service } = build({});
    (service as unknown as { stripe: unknown }).stripe = null;
    await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('ignores a Stripe event it has already processed (idempotent)', async () => {
    const { service, kafka, db } = build({ insert: [[]] }, paidSession());
    await service.handleWebhook(Buffer.from('{}'), 'sig');
    expect(db.update).not.toHaveBeenCalled();
    expect(kafka.emit).not.toHaveBeenCalled();
  });

  it('confirms the PENDING ticket, marks the payment PAID and emits the events', async () => {
    const payment = { id: 'pay-1', ticketId: TICKET_ID, userId: 'u1', status: 'PENDING', amount: 5000, currency: 'usd' };
    const info = {
      ticketId: TICKET_ID,
      ticketCode: 'ABC123',
      userId: 'u1',
      eventId: 'e1',
      eventTitle: 'Jazz',
      quantity: 2,
      totalPrice: 5000,
      email: 'buyer@example.com',
    };
    const { service, kafka, db } = build(
      {
        insert: [[{ id: 'evt_1' }]],
        select: [[payment], [info]],
        update: [[], [{ id: TICKET_ID }]],
      },
      paidSession(),
    );

    await service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(db.transaction).toHaveBeenCalledTimes(1);
    const paymentUpdate = (db.update as jest.Mock).mock.results[0].value;
    expect(paymentUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PAID', stripePaymentIntentId: 'pi_1' }),
    );
    const ticketUpdate = (db.update as jest.Mock).mock.results[1].value;
    expect(ticketUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CONFIRMED' }),
    );
    expect(kafka.emit).toHaveBeenCalledWith(
      KAFKA_TOPICS.PAYMENT_COMPLETED,
      expect.objectContaining({ paymentId: 'pay-1', amount: 5000 }),
    );
    expect(kafka.emit).toHaveBeenCalledWith(
      KAFKA_TOPICS.TICKET_PURCHASED,
      expect.objectContaining({ email: 'buyer@example.com', ticketCode: 'ABC123' }),
    );
  });

  it('records a late payment (ticket no longer pending) without confirming or e-mailing', async () => {
    const payment = { id: 'pay-1', ticketId: TICKET_ID, userId: 'u1', status: 'PENDING', amount: 5000, currency: 'usd' };
    const { service, kafka } = build(
      {
        insert: [[{ id: 'evt_1' }]],
        select: [[payment]],
        update: [[], []], // payment -> PAID, ticket was not PENDING any more
      },
      paidSession(),
    );
    await service.handleWebhook(Buffer.from('{}'), 'sig');
    expect(kafka.emit).not.toHaveBeenCalled(); // the reconcile job refunds it
  });

  it('releases the seats when the checkout session expires', async () => {
    const payment = { id: 'pay-1', ticketId: TICKET_ID, userId: 'u1', status: 'PENDING' };
    const { service, kafka, db } = build(
      {
        insert: [[{ id: 'evt_2' }]],
        select: [[payment]],
        update: [[], []],
      },
      { id: 'evt_2', type: 'checkout.session.expired', data: { object: { id: 'cs_test_1' } } },
    );
    await service.handleWebhook(Buffer.from('{}'), 'sig');
    const ticketUpdate = (db.update as jest.Mock).mock.results[1].value;
    expect(ticketUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CANCELLED' }),
    );
    expect(kafka.emit).toHaveBeenCalledWith(
      KAFKA_TOPICS.PAYMENT_FAILED,
      expect.objectContaining({ reason: 'session_expired' }),
    );
  });
});

describe('PaymentsServiceService.reconcile', () => {
  it('refunds PAID payments of cancelled tickets exactly once and notifies', async () => {
    const payment = { id: 'pay-1', ticketId: TICKET_ID, stripePaymentIntentId: 'pi_1', amount: 5000, currency: 'usd', status: 'PAID' };
    const info = { ticketId: TICKET_ID, userId: 'u1', email: 'b@example.com', eventTitle: 'Jazz' };
    const { service, kafka, db } = build({
      select: [[{ payment }], [info], []],
      update: [[{ id: 'pay-1' }]],
    });
    const refunds = { create: jest.fn().mockResolvedValue({ id: 're_1' }) };
    (service as unknown as { stripe: unknown }).stripe = { refunds };

    await service.reconcile();

    expect(refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_1' }),
      { idempotencyKey: 'refund-pay-1' },
    );
    const upd = (db.update as jest.Mock).mock.results[0].value;
    expect(upd.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'REFUNDED', stripeRefundId: 're_1' }),
    );
    expect(kafka.emit).toHaveBeenCalledWith(
      KAFKA_TOPICS.PAYMENT_REFUNDED,
      expect.objectContaining({ email: 'b@example.com', amount: 5000 }),
    );
  });

  it('keeps the payment PAID (retry next run) when Stripe fails', async () => {
    const payment = { id: 'pay-1', ticketId: TICKET_ID, stripePaymentIntentId: 'pi_1', amount: 5000, currency: 'usd', status: 'PAID' };
    const { service, kafka, db } = build({ select: [[{ payment }], []] });
    const refunds = { create: jest.fn().mockRejectedValue(new Error('stripe down')) };
    (service as unknown as { stripe: unknown }).stripe = { refunds };

    await service.reconcile();

    expect(db.update).not.toHaveBeenCalled();
    expect(kafka.emit).not.toHaveBeenCalled();
  });
});
