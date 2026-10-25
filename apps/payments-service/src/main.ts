import '@app/observability/tracing'; // MUST stay the first import (OpenTelemetry bootstrap)
import { NestFactory } from '@nestjs/core';
import { setupObservability } from '@app/observability';
import { PaymentsServiceModule } from './payments-service.module';
import { ValidationPipe } from '@nestjs/common';
import { SERVICES_PORTS } from '@app/common';

async function bootstrap() {
  // rawBody: Stripe signs the exact bytes of the webhook request, so the unparsed body is needed
  const app = await NestFactory.create(PaymentsServiceModule, {
    bufferLogs: true,
    rawBody: true,
  });
  setupObservability(app, 'payments-service');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(SERVICES_PORTS.PAYEMENTS_SERVICE);
  console.log(
    `Payments Service is running on port ${SERVICES_PORTS.PAYEMENTS_SERVICE}`,
  );
}
bootstrap();
