import '@app/observability/tracing'; // MUST stay the first import (OpenTelemetry bootstrap)
import { NestFactory } from '@nestjs/core';
import { setupObservability } from '@app/observability';
import { EventsServiceModule } from './events-service.module';
import { ValidationPipe } from '@nestjs/common';
import { SERVICES_PORTS } from '@app/common';

async function bootstrap() {
  const app = await NestFactory.create(EventsServiceModule, { bufferLogs: true });
  setupObservability(app, 'events-service');

  //Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(SERVICES_PORTS.EVENTS_SERVICE);
  console.log(
    `Events Service is running on port ${SERVICES_PORTS.EVENTS_SERVICE}`,
  );
}
bootstrap();
