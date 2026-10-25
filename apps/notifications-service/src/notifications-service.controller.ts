import { Controller, Get, Logger } from '@nestjs/common';
import { NotificationsServiceService } from './notifications-service.service';
import { EventPattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS } from '@app/kafka';
import { trackKafkaMessage } from '@app/observability';

@Controller()
export class NotificationsServiceController {
  private readonly logger = new Logger(NotificationsServiceController.name);

  constructor(
    private readonly notificationsServiceService: NotificationsServiceService,
  ) {}

  @Get('health')
  healthCheck() {
    return { status: 'ok', service: 'notifications-service' };
  }

  @EventPattern(KAFKA_TOPICS.USER_REGISTERED)
  async handleUserRegistered(
    @Payload() data: { userId: string; email: string; name: string },
  ) {
    this.logger.log(`Received user registered event: ${JSON.stringify(data)}`);
    await trackKafkaMessage(KAFKA_TOPICS.USER_REGISTERED, () =>
      this.notificationsServiceService.sendWelcomeEmail(data),
    );
  }

  @EventPattern(KAFKA_TOPICS.TICKET_PURCHASED)
  async handleTicketPurchased(
    @Payload()
    data: {
      ticketId: string;
      ticketCode: string;
      userId: string;
      email?: string;
      eventTitle?: string;
      quantity: number;
      totalPrice: number;
    },
  ) {
    this.logger.log(`Received ticket purchase event: ${JSON.stringify(data)}`);
    await trackKafkaMessage(KAFKA_TOPICS.TICKET_PURCHASED, () =>
      this.notificationsServiceService.sendTicketPurchasedEmail(data),
    );
  }

  @EventPattern(KAFKA_TOPICS.TICKET_CANCELLED)
  async handleTicketCancelled(
    @Payload()
    data: {
      ticketId: string;
      userId: string;
      email?: string;
      eventTitle?: string;
    },
  ) {
    this.logger.log(
      `Received ticket cancellation event: ${JSON.stringify(data)}`,
    );
    await trackKafkaMessage(KAFKA_TOPICS.TICKET_CANCELLED, () =>
      this.notificationsServiceService.sendTicketCancelledEmail(data),
    );
  }

  @EventPattern(KAFKA_TOPICS.EVENT_CANCELLED)
  async handleEventCancelled(
    @Payload()
    data: {
      eventId: string;
      eventTitle?: string;
      organizerId: string;
      attendees?: { email: string; name: string; ticketCode: string }[];
    },
  ) {
    this.logger.log(`Received event cancelled event: ${data.eventId}`);
    await trackKafkaMessage(KAFKA_TOPICS.EVENT_CANCELLED, () =>
      this.notificationsServiceService.sendEventCancelledEmail(data),
    );
  }

  @EventPattern(KAFKA_TOPICS.PAYMENT_REFUNDED)
  async handlePaymentRefunded(
    @Payload()
    data: {
      ticketId: string;
      userId: string;
      email?: string;
      eventTitle?: string;
      amount: number;
      currency?: string;
    },
  ) {
    this.logger.log(`Received payment refunded event for ticket ${data.ticketId}`);
    await trackKafkaMessage(KAFKA_TOPICS.PAYMENT_REFUNDED, () =>
      this.notificationsServiceService.sendRefundEmail(data),
    );
  }
}
