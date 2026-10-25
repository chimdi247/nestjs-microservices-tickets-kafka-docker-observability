import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { tickets } from './tickets';

export const paymentStatusEnum = pgEnum('payment_status', [
  'PENDING',
  'PAID',
  'FAILED',
  'REFUNDED',
  'EXPIRED',
]);

/** One row per Stripe Checkout Session started for a ticket. Amounts are in cents. */
export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  ticketId: uuid('ticket_id')
    .references(() => tickets.id)
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  amount: integer('amount').notNull(),
  currency: varchar('currency', { length: 3 }).default('usd').notNull(),
  status: paymentStatusEnum('status').default('PENDING').notNull(),
  stripeSessionId: varchar('stripe_session_id', { length: 255 }).unique(),
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  stripeRefundId: varchar('stripe_refund_id', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** Stripe event ids already handled: makes webhook delivery idempotent (Stripe retries and may duplicate). */
export const processedStripeEvents = pgTable('processed_stripe_events', {
  id: varchar('id', { length: 255 }).primaryKey(),
  type: varchar('type', { length: 100 }).notNull(),
  processedAt: timestamp('processed_at').defaultNow().notNull(),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
