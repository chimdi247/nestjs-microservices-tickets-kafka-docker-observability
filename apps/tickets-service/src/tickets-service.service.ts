import { PurchaseTicketDto, SERVICES_PORTS } from '@app/common';
import {
  ACTIVE_TICKET_STATUSES,
  DatabaseService,
  events,
  tickets,
  users,
} from '@app/database';
import { KAFKA_SERVICE, KAFKA_TOPICS } from '@app/kafka';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ClientKafka } from '@nestjs/microservices';
import { randomBytes } from 'crypto';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { bizMetrics, withSpan } from '@app/observability';

/** a PENDING (awaiting payment) booking holds its seats for this long. Stripe needs >= 30 min. */
const pendingTtlMs = () =>
  Math.max(30, Number(process.env.PENDING_TICKET_TTL_MINUTES ?? 30)) * 60_000;

@Injectable()
export class TicketsServiceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketsServiceService.name);
  private expiryTimer?: NodeJS.Timeout;

  private readonly paymentsUrl =
    process.env.PAYMENTS_SERVICE_URL ||
    `http://localhost:${SERVICES_PORTS.PAYEMENTS_SERVICE}`;

  constructor(
    @Inject(KAFKA_SERVICE) private readonly kafkClient: ClientKafka,
    private readonly dbService: DatabaseService,
    private readonly http: HttpService,
  ) {}

  async onModuleInit() {
    // connect to kafka when module initializes
    await this.kafkClient.connect();

    // release the seats of bookings that were not paid in time
    const everyMs = Number(process.env.PENDING_EXPIRY_INTERVAL_MS ?? 30000);
    this.expiryTimer = setInterval(() => {
      void this.expirePendingTickets().catch((err) =>
        this.logger.error(`expiry job failed: ${(err as Error).message}`),
      );
    }, everyMs);
    this.expiryTimer.unref();
  }

  onModuleDestroy() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
  }

  /** PENDING -> CANCELLED once expires_at has passed. The payments-service then closes the Stripe session. */
  async expirePendingTickets() {
    const expired = await this.dbService.db
      .update(tickets)
      .set({ status: 'CANCELLED', expiresAt: null, updatedAt: new Date() })
      .where(and(eq(tickets.status, 'PENDING'), lt(tickets.expiresAt, new Date())))
      .returning({ id: tickets.id });

    if (expired.length > 0) {
      this.logger.log(`released ${expired.length} unpaid booking(s)`);
    }
    return expired.length;
  }

  /** asks the payments-service for the hosted Stripe Checkout URL of a PENDING ticket */
  private async requestCheckoutUrl(ticketId: string, userId: string) {
    try {
      const res = await firstValueFrom(
        this.http.post<{ url: string }>(
          `${this.paymentsUrl}/checkout`,
          { ticketId },
          { headers: { 'x-user-id': userId } },
        ),
      );
      return res.data.url;
    } catch (error) {
      const err = error as { response?: { data: string | object; status: number } };
      if (err.response) throw new HttpException(err.response.data, err.response.status);
      throw new ServiceUnavailableException('Payment service is unavailable');
    }
  }

  /** (re)start payment for a booking that is still awaiting payment */
  async pay(id: string, userId: string) {
    return { checkoutUrl: await this.requestCheckoutUrl(id, userId) };
  }

  private generateTicketCode(): string {
    return randomBytes(6).toString('hex').toUpperCase();
  }

  /** Why a purchase was rejected - low-cardinality label for the failure KPI. */
  private purchaseFailureReason(err: unknown): string {
    if (err instanceof NotFoundException) return 'event_not_found';
    const message = (err as Error)?.message ?? '';
    if (message.startsWith('Only ')) return 'sold_out';
    if (message.includes('not published')) return 'event_not_published';
    return 'error';
  }

  /**
   * Instrumented entry point of the most important business flow.
   * Trace: tickets.purchase -> pg spans -> kafka "send ticket.purchased" -> (notifications-service) ...
   */
  purchase(purchaseDto: PurchaseTicketDto, userId: string) {
    return withSpan(
      'tickets.purchase',
      {
        'eventflow.event.id': purchaseDto.eventId,
        'eventflow.ticket.quantity': purchaseDto.quantity,
        'enduser.id': userId,
      },
      async (span) => {
        const start = process.hrtime.bigint();
        try {
          const result = await this.purchaseImpl(purchaseDto, userId);
          span.setAttribute('eventflow.ticket.id', result.ticket.id);
          span.setAttribute('eventflow.order.total_cents', result.ticket.totalPrice);
          // paid bookings are counted by the payments-service once the money arrived
          if (result.ticket.status === 'CONFIRMED') {
            bizMetrics.ticketPurchases.add(1);
            bizMetrics.ticketsSold.add(result.ticket.quantity);
            bizMetrics.revenueCents.add(result.ticket.totalPrice);
          }
          return result;
        } catch (err) {
          bizMetrics.ticketPurchaseFailures.add(1, {
            reason: this.purchaseFailureReason(err),
          });
          throw err;
        } finally {
          bizMetrics.ticketPurchaseDuration.record(
            Number(process.hrtime.bigint() - start) / 1e9,
          );
        }
      },
    );
  }

  private async purchaseImpl(purchaseDto: PurchaseTicketDto, userId: string) {
    const { eventId, quantity } = purchaseDto;

    // Everything that decides "is there room?" and "take the seats" happens in ONE transaction
    // while holding a row lock on the event. Concurrent purchases (and event updates/cancellations,
    // which lock the same row) are serialised, so the event can never be oversold.
    const { event, ticket } = await this.dbService.db.transaction(async (tx) => {
      const [event] = await tx
        .select()
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1)
        .for('update');

      if (!event) {
        throw new NotFoundException('Event not found');
      }

      if (event.status !== 'PUBLISHED') {
        throw new BadRequestException('Event is not published');
      }

      if (event.date && new Date(event.date).getTime() <= Date.now()) {
        throw new BadRequestException('Event has already started');
      }

      const soldTickets = await tx
        .select({ total: sql<number>`COALESCE(SUM(${tickets.quantity}), 0)` })
        .from(tickets)
        .where(
          and(
            eq(tickets.eventId, eventId),
            inArray(tickets.status, [...ACTIVE_TICKET_STATUSES]),
          ),
        );

      const currentSold = Number(soldTickets[0]?.total || 0);
      const remaining = Math.max(event.capacity - currentSold, 0);

      if (quantity > remaining) {
        throw new BadRequestException(
          remaining === 0
            ? 'Only 0 tickets remaining (sold out)'
            : `Only ${remaining} tickets remaining`,
        );
      }

      const [ticket] = await tx
        .insert(tickets)
        .values({
          eventId,
          userId,
          quantity,
          totalPrice: event.price * quantity,
          ticketCode: this.generateTicketCode(),
          // free events are confirmed at once; paid ones hold the seats until paid or expired
          status: event.price > 0 ? 'PENDING' : 'CONFIRMED',
          expiresAt:
            event.price > 0 ? new Date(Date.now() + pendingTtlMs()) : null,
        })
        .returning();

      return { event, ticket };
    });

    const summary = {
      id: ticket.id,
      ticketCode: ticket.ticketCode,
      eventId: ticket.eventId,
      eventTitle: event.title,
      quantity: ticket.quantity,
      totalPrice: ticket.totalPrice,
      status: ticket.status,
      purchasedAt: ticket.purchasedAt,
      expiresAt: ticket.expiresAt,
    };

    if (ticket.status === 'PENDING') {
      let checkoutUrl: string;
      try {
        checkoutUrl = await this.requestCheckoutUrl(ticket.id, userId);
      } catch (err) {
        // no payment page => do not keep the seats blocked
        await this.dbService.db
          .update(tickets)
          .set({ status: 'CANCELLED', expiresAt: null, updatedAt: new Date() })
          .where(and(eq(tickets.id, ticket.id), eq(tickets.status, 'PENDING')));
        throw err;
      }
      return {
        message: 'Seats reserved. Complete the payment to confirm your booking.',
        ticket: summary,
        checkoutUrl,
      };
    }

    const email = await this.emailOf(userId);

    this.kafkClient.emit(KAFKA_TOPICS.TICKET_PURCHASED, {
      ticketId: ticket.id,
      eventId: ticket.eventId,
      eventTitle: event.title,
      userId: ticket.userId,
      email,
      quantity: ticket.quantity,
      totalPrice: ticket.totalPrice,
      ticketCode: ticket.ticketCode,
      timestamp: new Date().toISOString(),
    });

    return {
      message: 'Ticket purchased successfully',
      ticket: summary,
      checkoutUrl: undefined as string | undefined,
    };
  }

  /** e-mail address of a user (the notifications-service needs it; it has no DB of its own) */
  private async emailOf(userId: string): Promise<string | undefined> {
    try {
      const [u] = await this.dbService.db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return u?.email;
    } catch {
      return undefined;
    }
  }

  private readonly ticketWithEvent = {
    id: tickets.id,
    ticketCode: tickets.ticketCode,
    quantity: tickets.quantity,
    totalPrice: tickets.totalPrice,
    status: tickets.status,
    purchasedAt: tickets.purchasedAt,
    checkedInAt: tickets.checkedInAt,
    userId: tickets.userId,
    eventId: events.id,
    eventTitle: events.title,
    eventDate: events.date,
    eventLocation: events.location,
    eventStatus: events.status,
    expiresAt: tickets.expiresAt,
  };

  async findMyTicket(userId: string) {
    return this.dbService.db
      .select(this.ticketWithEvent)
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(eq(tickets.userId, userId))
      .orderBy(desc(tickets.purchasedAt));
  }

  async findOne(id: string, userId: string) {
    const [ticket] = await this.dbService.db
      .select(this.ticketWithEvent)
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(and(eq(tickets.id, id), eq(tickets.userId, userId)))
      .limit(1);

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  cancel(id: string, userId: string) {
    return withSpan('tickets.cancel', { 'eventflow.ticket.id': id }, async () => {
      const result = await this.cancelImpl(id, userId);
      bizMetrics.ticketsCancelled.add(1);
      return result;
    });
  }

  private async cancelImpl(id: string, userId: string) {
    const [found] = await this.dbService.db
      .select({
        id: tickets.id,
        userId: tickets.userId,
        status: tickets.status,
        eventId: events.id,
        eventTitle: events.title,
        eventDate: events.date,
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(eq(tickets.id, id))
      .limit(1);

    if (!found) {
      throw new NotFoundException('Ticket not found');
    }

    if (found.userId !== userId) {
      throw new ForbiddenException('Ticket does not belong to user');
    }

    if (found.status === 'CANCELLED') {
      throw new BadRequestException('Ticket is already cancelled');
    }

    if (found.status === 'CHECKED_IN') {
      throw new BadRequestException('Ticket is already checked in');
    }

    if (found.eventDate && new Date(found.eventDate).getTime() <= Date.now()) {
      throw new BadRequestException('Event has already started');
    }

    // conditional update: loses gracefully against a concurrent check-in / cancel
    const [cancelled] = await this.dbService.db
      .update(tickets)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(
        and(
          eq(tickets.id, id),
          eq(tickets.userId, userId),
          inArray(tickets.status, ['PENDING', 'CONFIRMED']),
        ),
      )
      .returning();

    if (!cancelled) {
      throw new BadRequestException('Ticket can no longer be cancelled');
    }

    // an unpaid booking that is dropped needs no "ticket cancelled" e-mail; a paid one is refunded
    // by the payments-service (it notices the CANCELLED ticket of a PAID payment)
    if (found.status === 'CONFIRMED') {
      this.kafkClient.emit(KAFKA_TOPICS.TICKET_CANCELLED, {
        ticketId: cancelled.id,
        eventId: cancelled.eventId,
        eventTitle: found.eventTitle,
        userId: cancelled.userId,
        email: await this.emailOf(cancelled.userId),
        timestamp: new Date().toISOString(),
      });
    }

    return {
      message: 'Ticket cancelled successfully',
      ticket: { id: cancelled.id, status: cancelled.status },
    };
  }

  checkIn(ticketCode: string, organizerId: string, userRole = 'USER') {
    return withSpan('tickets.check_in', {}, async () => {
      const result = await this.checkInImpl(ticketCode, organizerId, userRole);
      bizMetrics.ticketsCheckedIn.add(1);
      return result;
    });
  }

  private async checkInImpl(
    rawTicketCode: string,
    organizerId: string,
    userRole: string,
  ) {
    const ticketCode = rawTicketCode.trim().toUpperCase();

    const [ticket] = await this.dbService.db
      .select({
        id: tickets.id,
        status: tickets.status,
        eventId: events.id,
        eventTitle: events.title,
        eventStatus: events.status,
        organizerId: events.organizerId,
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(eq(tickets.ticketCode, ticketCode))
      .limit(1);

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (ticket.organizerId !== organizerId && userRole !== 'ADMIN') {
      throw new ForbiddenException(
        'You are not authorized to check in this ticket',
      );
    }

    if (ticket.status === 'CHECKED_IN') {
      throw new BadRequestException('Ticket is already checked in');
    }

    if (ticket.status === 'CANCELLED' || ticket.eventStatus === 'CANCELLED') {
      throw new BadRequestException('Ticket is already cancelled');
    }

    // conditional update: two scanners racing on the same code => exactly one wins
    const [checkedIn] = await this.dbService.db
      .update(tickets)
      .set({
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(tickets.id, ticket.id), eq(tickets.status, 'CONFIRMED')))
      .returning();

    if (!checkedIn) {
      throw new BadRequestException('Ticket is already checked in');
    }

    this.kafkClient.emit(KAFKA_TOPICS.TICKET_CHECKED_IN, {
      ticketId: checkedIn.id,
      eventId: checkedIn.eventId,
      ticketCode: checkedIn.ticketCode,
      timestamp: new Date().toISOString(),
    });

    return {
      message: 'Ticket checked in successfully',
      ticket: {
        id: checkedIn.id,
        ticketCode: checkedIn.ticketCode,
        eventTitle: ticket.eventTitle,
        quantity: checkedIn.quantity,
        status: checkedIn.status,
        checkedInAt: checkedIn.checkedInAt,
      },
    };
  }

  async findEventTickst(eventId: string, organizerId: string, userRole = 'USER') {
    const [event] = await this.dbService.db
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.organizerId !== organizerId && userRole !== 'ADMIN') {
      throw new ForbiddenException(
        'You are not authorized to view the tickets of this event',
      );
    }

    return this.dbService.db
      .select({
        id: tickets.id,
        ticketCode: tickets.ticketCode,
        quantity: tickets.quantity,
        totalPrice: tickets.totalPrice,
        status: tickets.status,
        purchasedAt: tickets.purchasedAt,
        checkedInAt: tickets.checkedInAt,
        eventId: tickets.eventId,
        userId: tickets.userId,
        attendeeName: users.name,
        attendeeEmail: users.email,
      })
      .from(tickets)
      .innerJoin(users, eq(tickets.userId, users.id))
      .where(eq(tickets.eventId, eventId))
      .orderBy(desc(tickets.purchasedAt));
  }
}
