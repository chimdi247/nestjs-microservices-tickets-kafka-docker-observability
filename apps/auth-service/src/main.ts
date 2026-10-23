import '@app/observability/tracing'; // MUST stay the first import (OpenTelemetry bootstrap)
import { NestFactory } from '@nestjs/core';
import { setupObservability } from '@app/observability';
import { AuthServiceModule } from './auth-service.module';
import { SERVICES_PORTS } from '@app/common';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AuthServiceModule, { bufferLogs: true });
  setupObservability(app, 'auth-service');

  //Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(SERVICES_PORTS.AUTH_SERVICE);
  console.log(`Auth Service is running on port ${SERVICES_PORTS.AUTH_SERVICE}`);
}
bootstrap();
