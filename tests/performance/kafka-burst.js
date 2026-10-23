// Produces a burst of messages to a topic consumed by notifications-service so you can watch
// "Consumer lag" climb and drain on the Kafka dashboard.
//   node tests/performance/kafka-burst.js [count=2000] [topic=ticket.cancelled]
// ticket.cancelled is used because it triggers a cheap handler (one e-mail to MailHog per message).
const { Kafka } = require('kafkajs');

const count = Number(process.argv[2] ?? 2000);
const topic = process.argv[3] ?? 'ticket.cancelled';
const broker = process.env.KAFKA_BROKER ?? 'localhost:9093';

(async () => {
  const kafka = new Kafka({ clientId: 'kafka-burst', brokers: [broker] });
  const producer = kafka.producer();
  await producer.connect();
  const t0 = Date.now();
  const batch = 500;
  for (let i = 0; i < count; i += batch) {
    const messages = Array.from({ length: Math.min(batch, count - i) }, (_, j) => ({
      value: JSON.stringify({ ticketId: `burst-${i + j}`, userId: 'burst-user', timestamp: new Date().toISOString() }),
    }));
    await producer.send({ topic, messages });
  }
  await producer.disconnect();
  console.log(`produced ${count} messages to ${topic} in ${Date.now() - t0} ms`);
  console.log('Watch: http://localhost:3030/d/eventflow-kafka');
})().catch((e) => { console.error(e); process.exit(1); });
