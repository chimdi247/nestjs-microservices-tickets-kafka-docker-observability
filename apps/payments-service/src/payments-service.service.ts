import {
  DatabaseService,
  events,
  payments,
  processedStripeEvents,
  tickets,
  users,
} from '@app/database';
import { KAFKA_SERVICE, KAFKA_TOPICS } from '@app/kafka';
import { bizMetrics } from '@app/observability';
import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { and, desc, eq } from 'drizzle-orm';
import Stripe from 'stripe';

/** work to do after the database transaction committed (Kafka emits, metrics) */
type AfterCommit = () => void | Promise<void>;
// a drizzle transaction exposes the same query builders as the database itself
type Tx = Pick<DatabaseService['db'], 'select' | 'insert' | 'update'>;

/** Stripe requires a Checkout Session to live at least 30 minutes */
const STRIPE_MIN_SESSION_SECONDS = 30 * 60;

@Injectable()
export class PaymentsServiceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsServiceService.name);
  /** null when STRIPE_SECRET_KEY is not configured: the service still starts and answers 503 */
  protected stripe: Stripe | null;
  private timer?: NodeJS.Timeout;
  private reconciling = false;

  constructor(
    @Inject(KAFKA_SERVICE) private readonly kafkaClient: ClientKafka,
    private readonly dbService: DatabaseService,
  ) {
    const key = process.env.STRIPE_SECRET_KEY;
    this.stripe = key ? new Stripe(key) : null;
    if (!this.stripe) {
      this.logger.warn(
        'STRIPE_SECRET_KEY is not set: paid bookings are disabled until it is configured',
      );
    }
  }

  async onModuleInit() {
    await this.kafkaClient.connect();

    const everyMs = Number(process.env.PAYMENT_RECONCILE_INTERVAL_MS ?? 30000);
    this.timer = setInterval(() => {
      void this.reconcile().catch((err) =>
        this.logger.error(`reconcile failed: ${(err as Error).message}`),
      );
    }, everyMs);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Payments are not configured');
    }
    return this.stripe;
  }

  private get currency() {
    return (process.env.STRIPE_CURRENCY || 'usd').toLowerCase();
  }

  private get clientUrl() {
    return (process.env.CLIENT_URL || 'http://localhost:4000').replace(/\/$/, '');
  }

  // ===========================================================================
  // checkout
  // ===========================================================================

  async createCheckout(ticketId: string, userId: string) {
    const stripe = this.requireStripe();
    const db = this.dbService.db;

    const [row] = await db
      .select({
        ticketId: tickets.id,
        ticketStatus: tickets.status,
        ownerId: tickets.userId,
        quantity: tickets.quantity,
        totalPrice: tickets.totalPrice,
        expiresAt: tickets.expiresAt,
        eventTitle: events.title,
        eventDate: events.date,
        eventLocation: events.location,
        eventStatus: events.status,
        email: users.email,
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .innerJoin(users, eq(tickets.userId, users.id))
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!row) throw new NotFoundException('Ticket not found');
    if (row.ownerId !== userId) {
      throw new ForbiddenException('Ticket does not belong to user');
    }
    if (row.ticketStatus !== 'PENDING') {
      throw new BadRequestException('This ticket is not awaiting payment');
    }
    if (row.eventStatus !== 'PUBLISHED') {
      throw new BadRequestException('Event is not available');
    }
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        'The payment window for this booking has expired',
      );
    }

    // an unfinished session for this ticket can simply be resumed
    const [existing] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.ticketId, ticketId), eq(payments.status, 'PENDING')))
      .orderBy(desc(payments.createdAt))
      .limit(1);

    if (existing?.stripeSessionId) {
      try {
        const open = await stripe.checkout.sessions.retrieve(
          existing.stripeSessionId,
        );
        if (open.status === 'open' && open.url) {
          return { url: open.url, sessionId: open.id };
        }
      } catch (err) {
        this.logger.warn(`could not resume session: ${(err as Error).message}`);
      }
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const wantedSec = row.expiresAt
      ? Math.floor(row.expiresAt.getTime() / 1000) + 60
      : nowSec + STRIPE_MIN_SESSION_SECONDS + 60;
    // a payment that still lands after the ticket expired is refunded automatically (see reconcile)
    const sessionExpiresAt = Math.max(
      wantedSec,
      nowSec + STRIPE_MIN_SESSION_SECONDS + 10,
    );

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        client_reference_id: row.ticketId,
        customer_email: row.email,
        line_items: [
          {
            quantity: row.quantity,
            price_data: {
              currency: this.currency,
              unit_amount: Math.round(row.totalPrice / row.quantity),
              product_data: {
                name: row.eventTitle,
                description: `${row.eventDate.toISOString().slice(0, 16).replace('T', ' ')} UTC - ${row.eventLocation}`,
              },
            },
          },
        ],
        metadata: { ticketId: row.ticketId },
        payment_intent_data: { metadata: { ticketId: row.ticketId } },
        expires_at: sessionExpiresAt,
        success_url: `${this.clientUrl}/checkout/success?ticket=${row.ticketId}`,
        cancel_url: `${this.clientUrl}/checkout/cancelled?ticket=${row.ticketId}`,
      });
    } catch (err) {
      this.logger.error(`Stripe checkout failed: ${(err as Error).message}`);
      throw new BadGatewayException('Could not start the payment. Try again.');
    }

    if (!session.url) {
      throw new BadGatewayException('Stripe did not return a payment page');
    }

    await db.insert(payments).values({
      ticketId: row.ticketId,
      userId,
      amount: row.totalPrice,
      currency: this.currency,
      status: 'PENDING',
      stripeSessionId: session.id,
    });

    return { url: session.url, sessionId: session.id };
  }

  // ===========================================================================
  // webhook
  // ===========================================================================

  async handleWebhook(rawBody: Buffer, signature: string) {
    const stripe = this.requireStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException('Stripe webhook is not configured');
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }

    // The idempotency record and all state changes commit together: a failure rolls both back,
    // so Stripe's retry is processed again; a duplicate delivery is recognised and skipped.
    const after = await this.dbService.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(processedStripeEvents)
        .values({ id: event.id, type: event.type })
        .onConflictDoNothing()
        .returning({ id: processedStripeEvents.id });

      if (inserted.length === 0) {
        this.logger.log(`duplicate Stripe event ${event.id} ignored`);
        return [] as AfterCommit[];
      }

      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
          const session = event.data.object;
          if (session.payment_status !== 'paid') return [] as AfterCommit[];
          return this.onPaid(tx, session);
        }
        case 'checkout.session.expired':
          return this.onSessionExpired(tx, event.data.object);
        case 'checkout.session.async_payment_failed':
          return this.onSessionExpired(tx, event.data.object, 'FAILED');
        case 'charge.refunded':
          return this.onChargeRefunded(tx, event.data.object);
        default:
          return [] as AfterCommit[];
      }
    });

    for (const job of after) {
      try {
        await job();
      } catch (err) {
        this.logger.error(`post-commit step failed: ${(err as Error).message}`);
      }
    }
  }

  /** ticket facts needed for e-mails / metrics */
  private async describeTicket(
    db: Pick<DatabaseService['db'], 'select'>,
    ticketId: string,
  ) {
    const [t] = await db
      .select({
        ticketId: tickets.id,
        ticketCode: tickets.ticketCode,
        userId: tickets.userId,
        eventId: events.id,
        eventTitle: events.title,
        quantity: tickets.quantity,
        totalPrice: tickets.totalPrice,
        email: users.email,
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .innerJoin(users, eq(tickets.userId, users.id))
      .where(eq(tickets.id, ticketId))
      .limit(1);
    return t;
  }

  private async onPaid(
    tx: Tx,
    session: Stripe.Checkout.Session,
  ): Promise<AfterCommit[]> {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.stripeSessionId, session.id))
      .limit(1)
      .for('update');

    if (!payment) {
      this.logger.warn(`payment for session ${session.id} not found`);
      return [];
    }
    if (payment.status === 'PAID' || payment.status === 'REFUNDED') return [];

    const intentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    await tx
      .update(payments)
      .set({ status: 'PAID', stripePaymentIntentId: intentId, updatedAt: new Date() })
      .where(eq(payments.id, payment.id));

    // PENDING -> CONFIRMED. If the booking already expired/was cancelled the money is still
    // recorded as PAID and the reconcile job refunds it.
    const confirmed = await tx
      .update(tickets)
      .set({ status: 'CONFIRMED', expiresAt: null, updatedAt: new Date() })
      .where(and(eq(tickets.id, payment.ticketId), eq(tickets.status, 'PENDING')))
      .returning({ id: tickets.id });

    if (confirmed.length === 0) {
      this.logger.warn(
        `ticket ${payment.ticketId} was no longer pending when payment arrived: refund scheduled`,
      );
      return [];
    }

    const info = await this.describeTicket(tx, payment.ticketId);
    return [
      () => {
        bizMetrics.ticketPurchases.add(1);
        bizMetrics.ticketsSold.add(info.quantity);
        bizMetrics.revenueCents.add(info.totalPrice);
        this.kafkaClient.emit(KAFKA_TOPICS.PAYMENT_COMPLETED, {
          paymentId: payment.id,
          ticketId: info.ticketId,
          userId: info.userId,
          amount: payment.amount,
          currency: payment.currency,
          timestamp: new Date().toISOString(),
        });
        // the confirmation e-mail is driven by this event (same payload as for free tickets)
        this.kafkaClient.emit(KAFKA_TOPICS.TICKET_PURCHASED, {
          ticketId: info.ticketId,
          eventId: info.eventId,
          eventTitle: info.eventTitle,
          userId: info.userId,
          email: info.email,
          quantity: info.quantity,
          totalPrice: info.totalPrice,
          ticketCode: info.ticketCode,
          timestamp: new Date().toISOString(),
        });
      },
    ];
  }

  /** checkout session expired (nobody paid) or the async payment failed: release the seats */
  private async onSessionExpired(
    tx: Tx,
    session: Stripe.Checkout.Session,
    status: 'EXPIRED' | 'FAILED' = 'EXPIRED',
  ): Promise<AfterCommit[]> {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.stripeSessionId, session.id))
      .limit(1)
      .for('update');

    if (!payment || payment.status !== 'PENDING') return [];

    await tx
      .update(payments)
      .set({ status, updatedAt: new Date() })
      .where(eq(payments.id, payment.id));

    await tx
      .update(tickets)
      .set({ status: 'CANCELLED', expiresAt: null, updatedAt: new Date() })
      .where(and(eq(tickets.id, payment.ticketId), eq(tickets.status, 'PENDING')));

    return [
      () => {
        this.kafkaClient.emit(KAFKA_TOPICS.PAYMENT_FAILED, {
          paymentId: payment.id,
          ticketId: payment.ticketId,
          userId: payment.userId,
          reason: status === 'FAILED' ? 'payment_failed' : 'session_expired',
          timestamp: new Date().toISOString(),
        });
      },
    ];
  }

  /** a refund created outside the app (Stripe dashboard) must also invalidate the ticket */
  private async onChargeRefunded(
    tx: Tx,
    charge: Stripe.Charge,
  ): Promise<AfterCommit[]> {
    const intentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : (charge.payment_intent?.id ?? null);
    if (!intentId) return [];

    const flipped = await tx
      .update(payments)
      .set({ status: 'REFUNDED', updatedAt: new Date() })
      .where(
        and(eq(payments.stripePaymentIntentId, intentId), eq(payments.status, 'PAID')),
      )
      .returning();

    if (flipped.length === 0) return []; // we issued this refund ourselves: already handled

    const payment = flipped[0];
    await tx
      .update(tickets)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(
        and(
          eq(tickets.id, payment.ticketId),
          // a guest who already entered keeps their CHECKED_IN record
          eq(tickets.status, 'CONFIRMED'),
        ),
      );

    const info = await this.describeTicket(tx, payment.ticketId);
    return [() => this.emitRefunded(payment.id, payment.amount, payment.currency, info)];
  }

  private emitRefunded(
    paymentId: string,
    amount: number,
    currency: string,
    info?: { ticketId: string; userId: string; email: string; eventTitle: string },
  ) {
    if (!info) return;
    this.kafkaClient.emit(KAFKA_TOPICS.PAYMENT_REFUNDED, {
      paymentId,
      ticketId: info.ticketId,
      userId: info.userId,
      email: info.email,
      eventTitle: info.eventTitle,
      amount,
      currency,
      timestamp: new Date().toISOString(),
    });
  }

  // ===========================================================================
  // reconcile: converge payments with the ticket state (runs every 30 s)
  //   - PAID payment whose ticket is CANCELLED (user cancelled, event cancelled, expired before
  //     the money arrived)                        -> refund through Stripe
  //   - PENDING payment whose ticket is CANCELLED -> close the Checkout Session
  // Every step is idempotent, so several instances can run it safely.
  // ===========================================================================

  async reconcile() {
    if (this.reconciling || !this.stripe) return;
    this.reconciling = true;
    try {
      await this.refundCancelledTickets();
      await this.closeAbandonedSessions();
    } finally {
      this.reconciling = false;
    }
  }

  private async refundCancelledTickets() {
    const stripe = this.requireStripe();
    const db = this.dbService.db;

    const due = await db
      .select({ payment: payments })
      .from(payments)
      .innerJoin(tickets, eq(payments.ticketId, tickets.id))
      .where(and(eq(payments.status, 'PAID'), eq(tickets.status, 'CANCELLED')))
      .limit(20);

    for (const { payment } of due) {
      if (!payment.stripePaymentIntentId) continue;
      try {
        let refundId: string | null = null;
        try {
          const refund = await stripe.refunds.create(
            {
              payment_intent: payment.stripePaymentIntentId,
              metadata: { paymentId: payment.id, ticketId: payment.ticketId },
            },
            { idempotencyKey: `refund-${payment.id}` },
          );
          refundId = refund.id;
        } catch (err) {
          // already refunded (e.g. from the dashboard): just record it
          if ((err as { code?: string }).code !== 'charge_already_refunded') throw err;
        }

        const flipped = await db
          .update(payments)
          .set({
            status: 'REFUNDED',
            stripeRefundId: refundId,
            updatedAt: new Date(),
          })
          .where(and(eq(payments.id, payment.id), eq(payments.status, 'PAID')))
          .returning({ id: payments.id });

        if (flipped.length > 0) {
          const info = await this.describeTicket(db, payment.ticketId);
          this.emitRefunded(payment.id, payment.amount, payment.currency, info);
        }
      } catch (err) {
        // stays PAID + cancelled ticket => retried on the next run
        this.logger.error(
          `refund of payment ${payment.id} failed: ${(err as Error).message}`,
        );
      }
    }
  }

  private async closeAbandonedSessions() {
    const stripe = this.requireStripe();
    const db = this.dbService.db;

    const open = await db
      .select({ payment: payments })
      .from(payments)
      .innerJoin(tickets, eq(payments.ticketId, tickets.id))
      .where(and(eq(payments.status, 'PENDING'), eq(tickets.status, 'CANCELLED')))
      .limit(20);

    for (const { payment } of open) {
      try {
        if (payment.stripeSessionId) {
          await stripe.checkout.sessions.expire(payment.stripeSessionId);
        }
      } catch (err) {
        // already expired / completed: the webhook is the authority for completed sessions
        this.logger.warn(
          `could not expire session ${payment.stripeSessionId}: ${(err as Error).message}`,
        );
      }
      await db
        .update(payments)
        .set({ status: 'EXPIRED', updatedAt: new Date() })
        .where(and(eq(payments.id, payment.id), eq(payments.status, 'PENDING')));
    }
  }
}
