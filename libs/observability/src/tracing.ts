/**
 * OpenTelemetry bootstrap - MUST be the very first import of every service's main.ts:
 *
 *   import '@app/observability/tracing';
 *
 * Instrumentations work by patching modules (http, express, pg, ioredis, kafkajs, @nestjs/core ...)
 * at require() time, so the SDK has to start BEFORE any of those modules is loaded.
 * This file therefore imports only OpenTelemetry packages - never NestJS or application code.
 *
 * Signals (all exported over OTLP/HTTP to the OpenTelemetry Collector):
 *   - traces  : auto-instrumentation + manual spans
 *   - metrics : runtime/http/pg metrics from instrumentations + custom HTTP & business metrics
 *   - logs    : emitted through the OTel Logs API by OtelLogger (trace_id / span_id attached)
 *
 * Configuration is environment driven (standard OTEL_* variables), see docker-compose.yaml.
 */
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';

const disabled = process.env.OTEL_SDK_DISABLED === 'true';

if (!disabled) {
  if (process.env.OTEL_LOG_LEVEL === 'debug') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const serviceName = process.env.OTEL_SERVICE_NAME ?? 'eventflow-unknown';

  const resource = resourceFromAttributes({
    'service.name': serviceName,
    'service.version': process.env.APP_VERSION ?? '0.0.1',
    'deployment.environment':
      process.env.DEPLOYMENT_ENVIRONMENT ??
      process.env.NODE_ENV ??
      'development',
  });

  // ---------------- logs ----------------
  const loggerProvider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor(new OTLPLogExporter())],
  });
  logs.setGlobalLoggerProvider(loggerProvider);

  // ---------------- traces + metrics + auto-instrumentation ----------------
  const sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: Number(
        process.env.OTEL_METRIC_EXPORT_INTERVAL ?? 15000,
      ),
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // noisy / useless for this stack
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },

        // incoming + outgoing HTTP (gateway -> services via axios). Propagates W3C `traceparent`.
        '@opentelemetry/instrumentation-http': {
          // do not trace health probes (blackbox exporter / docker healthcheck every few seconds)
          ignoreIncomingRequestHook: (req) =>
            (req.url ?? '').startsWith('/health'),
        },

        // one span per express middleware layer is far too chatty with Nest; keep request handlers
        '@opentelemetry/instrumentation-express': {
          ignoreLayersType: ['middleware', 'router'] as never,
        },

        // Nest controller / handler spans
        '@opentelemetry/instrumentation-nestjs-core': {},

        // SQL spans (drizzle -> pg). Statement text only, never bound parameter values.
        '@opentelemetry/instrumentation-pg': {},

        // redis commands (gateway rate limiter)
        '@opentelemetry/instrumentation-ioredis': {},

        // Kafka: injects `traceparent` into message headers on produce and extracts it on consume,
        // so a trace continues across producer -> broker -> consumer (auth/events/tickets -> notifications).
        '@opentelemetry/instrumentation-kafkajs': {},
      }),
    ],
  });

  sdk.start();

  // flush everything before the container stops
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    Promise.allSettled([sdk.shutdown(), loggerProvider.shutdown()]).finally(
      () => process.exit(0),
    );
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
