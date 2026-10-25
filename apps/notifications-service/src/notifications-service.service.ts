import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from './email.service';

@Injectable()
export class NotificationsServiceService {
  private readonly logger = new Logger(NotificationsServiceService.name);

  constructor(private readonly emailService: EmailService) {}

  async sendWelcomeEmail(data: {
    userId: string;
    email: string;
    name: string;
  }) {
    this.logger.log(`Sending welcome email to ${data.email}`);

    const html = `
      <h1>Welcome to EventFlow, ${data.name}! 🎉</h1>
      <p>Your account has been created successfully.</p>
      <p>You can now:</p>
      <ul>
        <li>Browse and discover events</li>
        <li>Purchase tickets</li>
        <li>Create your own events</li>
      </ul>
      <p>Happy eventing!</p>
    `;

    await this.emailService.sendEmail(
      data.email,
      'Welcome to EventFlow!',
      html,
    );
  }

  async sendTicketPurchasedEmail(data: {
    userId: string;
    email?: string;
    ticketCode: string;
    eventTitle?: string;
    quantity: number;
    totalPrice: number;
  }) {
    const email = data.email;
    if (!email) {
      this.logger.warn(`No e-mail for user ${data.userId}; skipping ticket confirmation`);
      return;
    }
    this.logger.log(`Sending ticket confirmation to ${email}`);

    const html = `
      <h1>Ticket Confirmed! 🎟️</h1>
      <p>Your ticket purchase was successful.</p>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Event:</strong> ${data.eventTitle || 'Your Event'}</p>
        <p><strong>Ticket Code:</strong> ${data.ticketCode}</p>
        <p><strong>Quantity:</strong> ${data.quantity}</p>
        <p><strong>Total:</strong> $${(data.totalPrice / 100).toFixed(2)}</p>
      </div>
      <p>Show this ticket code at the event entrance.</p>
    `;

    await this.emailService.sendEmail(email, 'Your Ticket is Confirmed!', html);
  }

  async sendTicketCancelledEmail(data: {
    ticketId: string;
    userId: string;
    email?: string;
    eventTitle?: string;
  }) {
    const email = data.email;
    if (!email) {
      this.logger.warn(`No e-mail for user ${data.userId}; skipping cancellation notice`);
      return;
    }
    this.logger.log(`Sending cancellation notice to ${email}`);

    const html = `
      <h1>Ticket Cancelled</h1>
      <p>Your ticket${data.eventTitle ? ` for <strong>${data.eventTitle}</strong>` : ''} has been cancelled as requested.</p>
      <p>If you did not request this cancellation, please contact support.</p>
    `;

    await this.emailService.sendEmail(email, 'Ticket Cancelled', html);
  }

  async sendEventCancelledEmail(data: {
    eventId: string;
    eventTitle?: string;
    organizerId: string;
    attendees?: { email: string; name: string; ticketCode: string }[];
  }) {
    const attendees = data.attendees ?? [];
    this.logger.log(
      `Event ${data.eventId} cancelled; notifying ${attendees.length} attendee(s)`,
    );

    for (const a of attendees) {
      const html = `
        <h1>Event Cancelled</h1>
        <p>Hi ${a.name},</p>
        <p>Unfortunately <strong>${data.eventTitle ?? 'your event'}</strong> has been cancelled by the organizer.</p>
        <p>Your ticket <strong>${a.ticketCode}</strong> has been cancelled automatically.</p>
      `;
      await this.emailService.sendEmail(
        a.email,
        'Event Cancelled',
        html,
      );
    }
  }

  async sendRefundEmail(data: {
    userId: string;
    email?: string;
    eventTitle?: string;
    amount: number;
    currency?: string;
  }) {
    if (!data.email) {
      this.logger.warn(`No e-mail for user ${data.userId}; skipping refund notice`);
      return;
    }
    const amount = `${(data.amount / 100).toFixed(2)} ${(data.currency ?? 'usd').toUpperCase()}`;
    const html = `
      <h1>Refund issued</h1>
      <p>We refunded <strong>${amount}</strong>${data.eventTitle ? ` for <strong>${data.eventTitle}</strong>` : ''} to your original payment method.</p>
      <p>It usually appears on your statement within 5-10 business days.</p>
    `;
    await this.emailService.sendEmail(data.email, 'Your refund', html);
  }
}
