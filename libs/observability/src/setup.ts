import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { httpObservabilityMiddleware } from './http-metrics';
import { OtelLogger } from './otel-logger';

/**
 * One-call wiring for every service's main.ts:
 *
 *   const app = await NestFactory.create(AppModule, { bufferLogs: true });
 *   setupObservability(app, 'tickets-service');
 *
 *  - structured, trace-correlated logger (stdout + OTLP -> Loki)
 *  - GET /health      (liveness; used by docker healthchecks and the blackbox uptime probe;
 *                      registered as middleware so it bypasses guards / rate limiting / route order)
 *  - HTTP RED metrics + access log + x-trace-id header
 */
export function setupObservability(
  app: INestApplication,
  serviceName: string = process.env.OTEL_SERVICE_NAME ?? 'eventflow',
) {
  app.useLogger(new OtelLogger(serviceName));

  app.use('/health', (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.status(200).json({
      status: 'ok',
      service: serviceName,
      uptime_seconds: Math.round(process.uptime()),
    });
  });

  app.use(httpObservabilityMiddleware());
}
