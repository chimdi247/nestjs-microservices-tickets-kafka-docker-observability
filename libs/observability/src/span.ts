import {
  type Attributes,
  type Span,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';

const tracer = trace.getTracer('eventflow.business');

/** Expected business rejections (HttpException < 500) are not system errors. */
function isClientError(err: unknown): boolean {
  const e = err as { getStatus?: () => number };
  return typeof e?.getStatus === 'function' && e.getStatus() < 500;
}

/**
 * Manual instrumentation helper: runs `fn` inside a new active span (child of the current one),
 * records exceptions and sets the span status.
 *
 *   await withSpan('tickets.purchase', { 'eventflow.event.id': id }, async (span) => { ... });
 */
export function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T> | T,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (err) {
      span.recordException(err as Error);
      if (isClientError(err)) {
        span.setAttribute('eventflow.outcome', 'rejected');
      } else {
        span.setAttribute('eventflow.outcome', 'error');
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (err as Error)?.message,
        });
      }
      throw err;
    } finally {
      span.end();
    }
  });
}
