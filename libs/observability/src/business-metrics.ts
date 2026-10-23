import { metrics } from '@opentelemetry/api';
import { withSpan } from './span';

const meter = metrics.getMeter('eventflow.business');

const LATENCY_BUCKETS_S = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

/**
 * Business KPIs. Prometheus names (via Collector -> Mimir) are shown on the right.
 * Never put unbounded values (ids, emails) in attributes - they become metric labels.
 */
export const bizMetrics = {
  // eventflow_users_registered_total
  usersRegistered: meter.createCounter('eventflow.users.registered', {
    description: 'Users that completed registration',
  }),
  // eventflow_user_logins_total{outcome="success|failure"}
  userLogins: meter.createCounter('eventflow.user.logins', {
    description: 'Login attempts by outcome',
  }),
  // eventflow_events_{created,updated,published,cancelled}_total
  eventsCreated: meter.createCounter('eventflow.events.created'),
  eventsUpdated: meter.createCounter('eventflow.events.updated'),
  eventsPublished: meter.createCounter('eventflow.events.published'),
  eventsCancelled: meter.createCounter('eventflow.events.cancelled'),
  // eventflow_ticket_purchases_total (orders), eventflow_tickets_sold_total (sum of quantity)
  ticketPurchases: meter.createCounter('eventflow.ticket.purchases', {
    description: 'Successful ticket orders',
  }),
  ticketsSold: meter.createCounter('eventflow.tickets.sold', {
    description: 'Tickets sold (sum of quantity)',
  }),
  // eventflow_ticket_purchase_failures_total{reason}
  ticketPurchaseFailures: meter.createCounter(
    'eventflow.ticket.purchase.failures',
    { description: 'Rejected / failed ticket orders by reason' },
  ),
  // eventflow_tickets_cancelled_total, eventflow_tickets_checked_in_total
  ticketsCancelled: meter.createCounter('eventflow.tickets.cancelled'),
  ticketsCheckedIn: meter.createCounter('eventflow.tickets.checked_in'),
  // eventflow_revenue_cents_total
  revenueCents: meter.createCounter('eventflow.revenue.cents', {
    description: 'Gross ticket revenue in minor currency units',
  }),
  // eventflow_ticket_purchase_duration_seconds_bucket
  ticketPurchaseDuration: meter.createHistogram(
    'eventflow.ticket.purchase.duration',
    {
      unit: 's',
      description: 'End-to-end duration of the purchase use case',
      advice: { explicitBucketBoundaries: LATENCY_BUCKETS_S },
    },
  ),
  // eventflow_notifications_sent_total{type,outcome}
  notificationsSent: meter.createCounter('eventflow.notifications.sent', {
    description: 'Notification emails by type and outcome',
  }),
  // eventflow_kafka_messages_processed_total{topic,outcome}
  kafkaMessagesProcessed: meter.createCounter(
    'eventflow.kafka.messages.processed',
    { description: 'Kafka messages handled by consumers' },
  ),
  // eventflow_kafka_message_processing_duration_seconds_bucket{topic}
  kafkaProcessingDuration: meter.createHistogram(
    'eventflow.kafka.message.processing.duration',
    {
      unit: 's',
      advice: { explicitBucketBoundaries: LATENCY_BUCKETS_S },
    },
  ),
};

/**
 * Wraps a Kafka consumer handler: creates a span, counts the message and records processing time.
 * (The kafkajs auto-instrumentation already created the parent "process <topic>" CONSUMER span
 * from the propagated `traceparent` header - this span nests under it.)
 */
export async function trackKafkaMessage<T>(
  topic: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = process.hrtime.bigint();
  let outcome = 'success';
  try {
    return await withSpan(
      `handle ${topic}`,
      { 'messaging.system': 'kafka', 'messaging.destination.name': topic },
      fn,
    );
  } catch (err) {
    outcome = 'error';
    throw err;
  } finally {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    bizMetrics.kafkaMessagesProcessed.add(1, { topic, outcome });
    bizMetrics.kafkaProcessingDuration.record(seconds, { topic });
  }
}
