import { CreateEventDto, UpdateEventDto } from '@app/common';
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
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { and, desc, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import { bizMetrics, withSpan } from '@app/observability';

type EventRow = typeof events.$inferSelect;

const MANAGER_ROLES = ['ORGANIZER', 'ADMIN'];

/** Stripe refuses charges below 50 cents */
const MIN_PAID_PRICE_CENTS = 50;

function assertValidPrice(price: number | undefined) {
  if (price !== undefined && price > 0 && price < MIN_PAID_PRICE_CENTS) {
    throw new BadRequestException(
      'Paid tickets must cost at least $0.50 (use 0 for a free event)',
    );
  }
}

@Injectable()
export class EventsServiceService implements OnModuleInit {
  constructor(
    @Inject(KAFKA_SERVICE) private readonly kafkClient: ClientKafka,
    private readonly dbService: DatabaseService,
  ) {}

  async onModuleInit() {
    // connect to kafka when module initializes
    await this.kafkClient.connect();
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  /** seats taken per event (single source of truth = the tickets table, same rules as tickets-service) */
  private async soldByEvent(eventIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (eventIds.length === 0) return map;

    const rows = await this.dbService.db
      .select({
        eventId: tickets.eventId,
        sold: sql<number>`COALESCE(SUM(${tickets.quantity}), 0)`,
      })
      .from(tickets)
      .where(
        and(
          inArray(tickets.eventId, eventIds),
          inArray(tickets.status, [...ACTIVE_TICKET_STATUSES]),
        ),
      )
      .groupBy(tickets.eventId);

    for (const r of rows) map.set(r.eventId, Number(r.sold));
    return map;
  }

  private async withAvailability(rows: EventRow[]) {
    const sold = await this.soldByEvent(rows.map((e) => e.id));
    return rows.map((e) => {
      const ticketsSold = sold.get(e.id) ?? 0;
      return {
        ...e,
        ticketsSold,
        availableTickets: Math.max(e.capacity - ticketsSold, 0),
      };
    });
  }

  private async withAvailabilityOne(row: EventRow) {
    return (await this.withAvailability([row]))[0];
  }

  private assertCanManage(event: EventRow, userId: string, role: string, action: string) {
    if (event.organizerId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException(`You are not authorized to ${action} this event`);
    }
  }

  private async getEventOrThrow(id: string): Promise<EventRow> {
    const [event] = await this.dbService.db
      .select()
      .from(events)
      .where(eq(events.id, id))
      .limit(1);

    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  create(createEventDto: CreateEventDto, organizerId: string, role = 'USER') {
    return withSpan(
      'events.create',
      {
        'enduser.id': organizerId,
        'eventflow.event.capacity': createEventDto.capacity,
      },
      async (span) => {
        const event = await this.createImpl(createEventDto, organizerId, role);
        span.setAttribute('eventflow.event.id', event.id);
        bizMetrics.eventsCreated.add(1);
        return event;
      },
    );
  }

  private async createImpl(
    createEventDto: CreateEventDto,
    organizerId: string,
    role: string,
  ) {
    if (!MANAGER_ROLES.includes(role)) {
      throw new ForbiddenException('Only organizers can create events');
    }

    assertValidPrice(createEventDto.price);

    const date = new Date(createEventDto.date);
    if (date.getTime() <= Date.now()) {
      throw new BadRequestException('Event date must be in the future');
    }

    const [event] = await this.dbService.db
      .insert(events)
      .values({
        ...createEventDto,
        date,
        price: createEventDto.price || 0,
        organizerId,
      })
      .returning();

    this.kafkClient.emit(KAFKA_TOPICS.EVENT_CREATED, {
      eventId: event.id,
      organizerId: event.organizerId,
      title: event.title,
      timestamp: new Date().toISOString(),
    });

    return this.withAvailabilityOne(event);
  }

  // ---------------------------------------------------------------------------
  // read
  // ---------------------------------------------------------------------------

  /** public catalogue: published, upcoming events, soonest first */
  async findAll() {
    const rows = await this.dbService.db
      .select()
      .from(events)
      .where(and(eq(events.status, 'PUBLISHED'), gt(events.date, new Date())))
      .orderBy(asc(events.date));

    return this.withAvailability(rows);
  }

  /** drafts are only visible to their organizer (or an admin) */
  async findOne(id: string, userId?: string, role?: string) {
    const event = await this.getEventOrThrow(id);

    if (
      event.status === 'DRAFT' &&
      event.organizerId !== userId &&
      role !== 'ADMIN'
    ) {
      throw new NotFoundException('Event not found');
    }

    return this.withAvailabilityOne(event);
  }

  async findMyEvent(organizerId: string) {
    const rows = await this.dbService.db
      .select()
      .from(events)
      .where(eq(events.organizerId, organizerId))
      .orderBy(desc(events.createdAt));

    return this.withAvailability(rows);
  }

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  update(
    id: string,
    updateEventDto: UpdateEventDto,
    userId: string,
    userRole: string,
  ) {
    return withSpan('events.update', { 'eventflow.event.id': id }, async () => {
      const updated = await this.updateImpl(id, updateEventDto, userId, userRole);
      bizMetrics.eventsUpdated.add(1);
      return updated;
    });
  }

  private async updateImpl(
    id: string,
    updateEventDto: UpdateEventDto,
    userId: string,
    userRole: string,
  ) {
    const updated = await this.dbService.db.transaction(async (tx) => {
      // lock the event row: serialises with ticket purchases and cancellations
      const [event] = await tx
        .select()
        .from(events)
        .where(eq(events.id, id))
        .for('update');

      if (!event) throw new NotFoundException('Event not found');
      this.assertCanManage(event, userId, userRole, 'update');

      if (event.status === 'CANCELLED') {
        throw new BadRequestException('A cancelled event cannot be updated');
      }
      assertValidPrice(updateEventDto.price);

      if (updateEventDto.capacity !== undefined) {
        const [{ sold }] = await tx
          .select({ sold: sql<number>`COALESCE(SUM(${tickets.quantity}), 0)` })
          .from(tickets)
          .where(
            and(
              eq(tickets.eventId, id),
              inArray(tickets.status, [...ACTIVE_TICKET_STATUSES]),
            ),
          );
        if (updateEventDto.capacity < Number(sold)) {
          throw new BadRequestException(
            `Capacity cannot be lower than the ${Number(sold)} tickets already sold`,
          );
        }
      }

      const { date, ...rest } = updateEventDto;
      const patch: Partial<typeof events.$inferInsert> = {
        ...rest,
        updatedAt: new Date(),
      };
      if (date) {
        const d = new Date(date);
        // an unchanged date is always fine (lets organizers fix typos after the event started)
        if (d.getTime() !== event.date.getTime()) {
          if (d.getTime() <= Date.now()) {
            throw new BadRequestException('Event date must be in the future');
          }
          patch.date = d;
        }
      }

      const [row] = await tx
        .update(events)
        .set(patch)
        .where(eq(events.id, id))
        .returning();
      return row;
    });

    this.kafkClient.emit(KAFKA_TOPICS.EVENT_UPDATED, {
      eventId: updated.id,
      changes: Object.keys(updateEventDto),
      timestamp: new Date().toISOString(),
    });

    return this.withAvailabilityOne(updated);
  }

  // ---------------------------------------------------------------------------
  // publish
  // ---------------------------------------------------------------------------

  publish(id: string, userId: string, userRole: string) {
    return withSpan('events.publish', { 'eventflow.event.id': id }, async () => {
      const published = await this.publishImpl(id, userId, userRole);
      bizMetrics.eventsPublished.add(1);
      return published;
    });
  }

  private async publishImpl(id: string, userId: string, userRole: string) {
    const event = await this.getEventOrThrow(id);
    this.assertCanManage(event, userId, userRole, 'publish');

    if (event.status === 'CANCELLED') {
      throw new BadRequestException('A cancelled event cannot be published');
    }
    if (event.status === 'PUBLISHED') {
      return this.withAvailabilityOne(event);
    }
    if (event.date.getTime() <= Date.now()) {
      throw new BadRequestException('Cannot publish an event in the past');
    }

    const [published] = await this.dbService.db
      .update(events)
      .set({ status: 'PUBLISHED', updatedAt: new Date() })
      .where(and(eq(events.id, id), eq(events.status, 'DRAFT')))
      .returning();

    return this.withAvailabilityOne(published ?? (await this.getEventOrThrow(id)));
  }

  // ---------------------------------------------------------------------------
  // cancel  (cascades to the tickets table in ONE transaction => no orphaned tickets)
  // ---------------------------------------------------------------------------

  cancel(id: string, userId: string, userRole: string) {
    return withSpan('events.cancel', { 'eventflow.event.id': id }, async () => {
      const cancelled = await this.cancelImpl(id, userId, userRole);
      bizMetrics.eventsCancelled.add(1);
      return cancelled;
    });
  }

  private async cancelImpl(id: string, userId: string, userRole: string) {
    const { event, affected } = await this.dbService.db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(events)
        .where(eq(events.id, id))
        .for('update');

      if (!locked) throw new NotFoundException('Event not found');
      this.assertCanManage(locked, userId, userRole, 'cancel');

      if (locked.status === 'CANCELLED') {
        throw new BadRequestException('Event is already cancelled');
      }

      const [row] = await tx
        .update(events)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(eq(events.id, id))
        .returning();

      // refund/cancel every ticket that has not been used yet
      const cancelledTickets = await tx
        .update(tickets)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(
          and(
            eq(tickets.eventId, id),
            inArray(tickets.status, ['PENDING', 'CONFIRMED']),
          ),
        )
        .returning({
          id: tickets.id,
          userId: tickets.userId,
          ticketCode: tickets.ticketCode,
          quantity: tickets.quantity,
        });

      return { event: row, affected: cancelledTickets };
    });

    // attendees to notify (read after commit; best effort for the e-mail payload)
    let attendees: { email: string; name: string; ticketCode: string }[] = [];
    if (affected.length > 0) {
      const people = await this.dbService.db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(inArray(users.id, [...new Set(affected.map((t) => t.userId))]));
      const byId = new Map<string, { email: string; name: string }>();
      for (const p of people) byId.set(p.id, p);
      attendees = affected
        .map((t) => ({
          email: byId.get(t.userId)?.email ?? '',
          name: byId.get(t.userId)?.name ?? '',
          ticketCode: t.ticketCode,
        }))
        .filter((a) => a.email);
      bizMetrics.ticketsCancelled.add(affected.length);
    }

    this.kafkClient.emit(KAFKA_TOPICS.EVENT_CANCELLED, {
      eventId: event.id,
      eventTitle: event.title,
      organizerId: event.organizerId,
      cancelledTickets: affected.length,
      attendees,
      timestamp: new Date().toISOString(),
    });

    return this.withAvailabilityOne(event);
  }
}
