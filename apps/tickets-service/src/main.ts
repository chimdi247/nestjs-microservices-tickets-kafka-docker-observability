import '@app/observability/tracing'; // MUST stay the first import (OpenTelemetry bootstrap)
import { NestFactory } from '@nestjs/core';
import { setupObservability } from '@app/observability';
import { TicketsServiceModule } from './tickets-service.module';
import { ValidationPipe } from '@nestjs/common';
import { SERVICES_PORTS } from '@app/common';

async function bootstrap() {
  const app = await NestFactory.create(TicketsServiceModule, { bufferLogs: true });
  setupObservability(app, 'tickets-service');

  //Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(SERVICES_PORTS.TICKETS_SERVICE);
  console.log(
    `Tickets Service is running on port ${SERVICES_PORTS.TICKETS_SERVICE}`,
  );
}
bootstrap();
