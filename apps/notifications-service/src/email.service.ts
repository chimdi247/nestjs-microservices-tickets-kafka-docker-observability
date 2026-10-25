import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { SpanStatusCode } from '@opentelemetry/api';
import { bizMetrics, withSpan } from '@app/observability';

@Injectable()
export class EmailService implements OnModuleInit {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  onModuleInit() {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '1025', 10),
      secure: process.env.SMTP_SECURE === 'true', // true only for port 465
      requireTLS: process.env.SMTP_REQUIRE_TLS === 'true', // true for port 587 (STARTTLS)
      // MailHog (local default) needs no login; real providers such as Gmail do
      ...(user && pass ? { auth: { user, pass } } : {}),
    });

    this.logger.log('Email service initialized');
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    // `subject` is a fixed template string per notification type -> safe as a metric label
    await withSpan(
      'email.send',
      {
        'peer.service': 'smtp',
        'server.address': process.env.SMTP_HOST || 'localhost',
        'eventflow.email.subject': subject,
      },
      async (span) => {
        try {
          await this.transporter.sendMail({
            from:
              process.env.SMTP_FROM || '"EventFlow" <noreply@eventflowapp.com>',
            to,
            subject,
            html,
          });

          bizMetrics.notificationsSent.add(1, { type: subject, outcome: 'success' });
          this.logger.log(`Email sent to ${to}`);
        } catch (error) {
          // the failure is swallowed on purpose (Kafka message must not be retried forever),
          // so record it explicitly on the span + metric
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (error as Error).message,
          });
          bizMetrics.notificationsSent.add(1, { type: subject, outcome: 'failure' });
          this.logger.error(`Error sending email to ${to}: ${error}`);
        }
      },
    );
  }
}
