import '@app/observability/tracing'; // MUST stay the first import (OpenTelemetry bootstrap)
import { NestFactory } from '@nestjs/core';
import { setupObservability } from '@app/observability';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import {
  AllExceptionsFilter,
  HttpExceptionFilter,
  SERVICES_PORTS,
  TransformInterceptor,
} from '@app/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.enableCors({
    origin: ['http://localhost:4000', 'http://localhost:3000' ,'http://136.71.169.139:4000'].filter(
      Boolean,
    ),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['x-trace-id'],
  });

  setupObservability(app, 'api-gateway');

  //Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global interceptors, filters, and other middlewares can be set up here
  app.useGlobalInterceptors(new TransformInterceptor());

  //Note: Filters are applied in a reversed order
  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());

  await app.listen(process.env.PORT || SERVICES_PORTS.API_GATEWAY);
  console.log(
    `API Gateway is running on port ${process.env.PORT || SERVICES_PORTS.API_GATEWAY}`,
  );
}
bootstrap();
