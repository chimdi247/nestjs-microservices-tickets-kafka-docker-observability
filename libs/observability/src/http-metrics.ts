import { context as otelContext, metrics, trace } from '@opentelemetry/api';
import type { NextFunction, Request, Response } from 'express';
import { OtelLogger } from './otel-logger';

const meter = metrics.getMeter('eventflow.http');

// eventflow dashboards read these two series (job = service name):
//   app_http_requests_total{method,route,status_code}
//   app_http_request_duration_seconds_bucket{method,route,status_code,le}
const httpRequests = meter.createCounter('app.http.requests', {
  description: 'HTTP requests handled, by method / route template / status',
});
const httpDuration = meter.createHistogram('app.http.request.duration', {
  unit: 's',
  description: 'HTTP server request duration',
  advice: {
    explicitBucketBoundaries: [
      0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
    ],
  },
});

// app_uptime_seconds
meter
  .createObservableGauge('app.uptime', {
    unit: 's',
    description: 'Seconds since the process started',
  })
  .addCallback((result) => result.observe(process.uptime()));

/**
 * Express middleware: RED metrics + one structured access-log line per request.
 *  - `route` is the matched route TEMPLATE (/events/:id), never the raw URL -> bounded cardinality
 *  - the histogram is recorded inside the request's trace context, so Mimir stores an
 *    exemplar (trace_id) and Grafana can jump from a slow bucket straight to the trace
 *  - the trace id is returned in the `x-trace-id` response header (handy for support / tests)
 */
export function httpObservabilityMiddleware() {
  const accessLog = new OtelLogger('http');

  return (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    const ctx = otelContext.active();

    const spanContext = trace.getSpanContext(ctx);
    if (spanContext) res.setHeader('x-trace-id', spanContext.traceId);

    res.on('finish', () => {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      const route = req.route?.path
        ? `${req.baseUrl ?? ''}${req.route.path as string}`
        : 'unmatched';
      const status = res.statusCode;
      const attributes = {
        method: req.method,
        route,
        status_code: String(status),
      };

      otelContext.with(ctx, () => {
        httpRequests.add(1, attributes);
        httpDuration.record(seconds, attributes);

        const line = {
          message: 'http_request',
          method: req.method,
          route,
          path: req.originalUrl.split('?')[0], // never log query strings (tokens)
          status_code: status,
          duration_ms: Math.round(seconds * 1000),
        };
        if (status >= 500) accessLog.error(line);
        else if (status >= 400) accessLog.warn(line);
        else accessLog.log(line);
      });
    });

    next();
  };
}
