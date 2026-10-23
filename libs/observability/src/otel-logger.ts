import type { LoggerService } from '@nestjs/common';
import { context as otelContext, trace } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';

type Level = 'verbose' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const SEVERITY: Record<Level, SeverityNumber> = {
  verbose: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
};

/**
 * Structured logger that replaces Nest's default logger (app.useLogger()).
 *
 * Every record is
 *   1. written to stdout as ONE JSON line  -> `docker logs` stays readable/greppable
 *   2. emitted through the OpenTelemetry Logs API -> Collector -> Loki
 *
 * The JSON body always contains `trace_id` and `span_id` of the active span. Grafana's Loki
 * datasource has a derived field on `"trace_id":"..."`, which renders the "View trace" button
 * next to each log line and opens the whole trace (all spans, across services) in Tempo.
 */
export class OtelLogger implements LoggerService {
  private readonly otelLogger = logs.getLogger('eventflow.logger');

  constructor(
    private readonly service: string = process.env.OTEL_SERVICE_NAME ??
      'eventflow',
  ) {}

  log(message: unknown, ...params: unknown[]) {
    this.write('info', message, params);
  }
  error(message: unknown, ...params: unknown[]) {
    this.write('error', message, params);
  }
  warn(message: unknown, ...params: unknown[]) {
    this.write('warn', message, params);
  }
  debug(message: unknown, ...params: unknown[]) {
    this.write('debug', message, params);
  }
  verbose(message: unknown, ...params: unknown[]) {
    this.write('verbose', message, params);
  }
  fatal(message: unknown, ...params: unknown[]) {
    this.write('fatal', message, params);
  }

  private write(level: Level, message: unknown, rawParams: unknown[]) {
    const params = [...rawParams];

    // Nest convention: the last string parameter is the logger context (class name);
    // for error()/fatal() the one before it may be the stack trace.
    let ctx: string | undefined;
    if (params.length > 0 && typeof params[params.length - 1] === 'string') {
      ctx = params.pop() as string;
    }
    let stack: string | undefined;
    if (
      (level === 'error' || level === 'fatal') &&
      params.length > 0 &&
      typeof params[0] === 'string'
    ) {
      stack = params.shift() as string;
    }

    let text: string;
    const fields: Record<string, unknown> = {};
    if (message instanceof Error) {
      text = message.message;
      stack = stack ?? message.stack;
    } else if (message !== null && typeof message === 'object') {
      const { message: m, msg, ...rest } = message as Record<string, unknown>;
      text = String(m ?? msg ?? 'log');
      Object.assign(fields, rest);
    } else {
      text = String(message);
    }
    for (const p of params) {
      if (p !== null && typeof p === 'object' && !(p instanceof Error)) {
        Object.assign(fields, p);
      }
    }

    const spanContext = trace.getSpanContext(otelContext.active());
    const record: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      context: ctx,
      message: text,
      trace_id: spanContext?.traceId,
      span_id: spanContext?.spanId,
      ...fields,
      ...(stack ? { stack } : {}),
    };

    if (process.env.LOG_TO_STDOUT !== 'false') {
      process.stdout.write(JSON.stringify(record) + '\n');
    }

    // Flatten primitive fields into OTel log attributes (-> Loki structured metadata).
    const attributes: Record<string, string | number | boolean> = {};
    if (ctx) attributes['log.context'] = ctx;
    for (const [k, v] of Object.entries(fields)) {
      if (['string', 'number', 'boolean'].includes(typeof v)) {
        attributes[k] = v as string | number | boolean;
      }
    }
    if (stack) attributes['exception.stacktrace'] = stack;

    this.otelLogger.emit({
      severityNumber: SEVERITY[level],
      severityText: level.toUpperCase(),
      body: JSON.stringify(record),
      attributes,
    });
  }
}
