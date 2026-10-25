import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { events } from './events';

export const ticketStatusEnum = pgEnum('ticket_status', [
  'PENDING',
  'CONFIRMED',
  'CHECKED_IN',
  'CANCELLED',
]);

export const tickets = pgTable('tickets', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .references(() => events.id)
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  quantity: integer('quantity').default(1).notNull(),
  totalPrice: integer('total_price').notNull(),
  status: ticketStatusEnum('status').default('PENDING').notNull(),
  ticketCode: varchar('ticket_code', { length: 20 }).unique().notNull(),
  purchasedAt: timestamp('purchased_at').defaultNow().notNull(),
  checkedInAt: timestamp('checked_in_at'),
  /** only set while the ticket is PENDING (awaiting payment); the seats are released after it passes */
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;

/**
 * Ticket statuses that occupy seats of an event. CANCELLED tickets free their seats.
 * Single source of truth: events-service (availability) and tickets-service (purchase) both use it.
 */
export const ACTIVE_TICKET_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'CHECKED_IN',
] as const;
