import { CreateEventDto, UpdateEventDto } from '@app/common';
import { DatabaseService, events } from '@app/database';
import { KAFKA_SERVICE, KAFKA_TOPICS } from '@app/kafka';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { eq } from 'drizzle-orm';
import { bizMetrics, withSpan } from '@app/observability';

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

  create(createEventDto: CreateEventDto, organizerId: string) {
    return withSpan(
      'events.create',
      { 'enduser.id': organizerId, 'eventflow.event.capacity': createEventDto.capacity },
      async (span) => {
        const event = await this.createImpl(createEventDto, organizerId);
        span.setAttribute('eventflow.event.id', event.id);
        bizMetrics.eventsCreated.add(1);
        return event;
      },
    );
  }

  private async createImpl(createEventDto: CreateEventDto, organizerId: string) {
    const [event] = await this.dbService.db
      .insert(events)
      .values({
        ...createEventDto,
        date: new Date(createEventDto.date),
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

    return event;
  }

  async findAll() {
    return this.dbService.db
      .select()
      .from(events)
      .where(eq(events.status, 'PUBLISHED'));
  }

  async findOne(id: string) {
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
    const event = await this.findOne(id);

    if (event.organizerId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException(
        'You are not authorized to update this event',
      );
    }

    const updatedData: Record<string, unknown> = { ...updateEventDto };
    if (updateEventDto.date) {
      updatedData.date = new Date(updateEventDto.date);
    }
    updatedData.updatedAt = new Date();

    const [updated] = await this.dbService.db
      .update(events)
      .set(updatedData)
      .where(eq(events.id, id))
      .returning();

    this.kafkClient.emit(KAFKA_TOPICS.EVENT_UPDATED, {
      eventId: updated.id,
      changes: Object.keys(updateEventDto),
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  publish(id: string, userId: string, userRole: string) {
    return withSpan('events.publish', { 'eventflow.event.id': id }, async () => {
      const published = await this.publishImpl(id, userId, userRole);
      bizMetrics.eventsPublished.add(1);
      return published;
    });
  }

  private async publishImpl(id: string, userId: string, userRole: string) {
    const event = await this.findOne(id);

    if (event.organizerId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException(
        'You are not authorized to publish this event',
      );
    }

    const [published] = await this.dbService.db
      .update(events)
      .set({ status: 'PUBLISHED', updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();

    return published;
  }

  cancel(id: string, userId: string, userRole: string) {
    return withSpan('events.cancel', { 'eventflow.event.id': id }, async () => {
      const cancelled = await this.cancelImpl(id, userId, userRole);
      bizMetrics.eventsCancelled.add(1);
      return cancelled;
    });
  }

  private async cancelImpl(id: string, userId: string, userRole: string) {
    const event = await this.findOne(id);

    if (event.organizerId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException(
        'You are not authorized to cancel this event',
      );
    }

    const [cancelled] = await this.dbService.db
      .update(events)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();

    this.kafkClient.emit(KAFKA_TOPICS.EVENT_CANCELLED, {
      eventId: cancelled.id,
      organizerId: cancelled.organizerId,
      timestamp: new Date().toISOString(),
    });

    return cancelled;
  }

  async findMyEvent(organizerId: string) {
    return this.dbService.db
      .select()
      .from(events)
      .where(eq(events.organizerId, organizerId));
  }
}
