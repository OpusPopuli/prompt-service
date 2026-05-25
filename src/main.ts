import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { StructuredLoggerService } from './common/structured-logger.service';

async function bootstrap() {
  const logger = new StructuredLoggerService('Bootstrap');
  // Passing logger here tells NestJS to route all Logger instances (including
  // `new Logger(ClassName)` used in services) through StructuredLoggerService,
  // so every log line picks up correlation IDs from the ALS store.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger,
  });

  // Make SIGTERM trigger onModuleDestroy → PrismaService.$disconnect runs
  // before the container exits. Without this, in-flight requests get cut
  // and DB connections are left to time out (issue #58).
  app.enableShutdownHooks();

  // Standard security headers (HSTS, frame-ancestors, X-Content-Type-Options,
  // removes X-Powered-By, etc). Safe for an HMAC server-to-server API.
  app.use(helmet());

  // No browser clients consume this API — set CORS off explicitly so the
  // policy is intentional rather than relying on Express's default behavior.
  app.enableCors({ origin: false });

  // Bump body-parser limit. Default is 100KB; the civics-extraction
  // prompt template (~9KB) plus the inbound HTML/text content from a
  // crawled civics page can comfortably exceed that on Assembly
  // resources pages. Using `useBodyParser` (vs `app.use(json(...))`)
  // preserves the `rawBody: true` capture used by HMAC signature
  // verification in api-key.guard.
  app.useBodyParser('json', { limit: '5mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '5mb' });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const configService = app.get(ConfigService);

  // Swagger leaks the full admin/node-registry surface — gate it. Defaults
  // off in production unless ENABLE_SWAGGER=true is set explicitly.
  const swaggerExplicit = configService.get<string>('ENABLE_SWAGGER');
  const enableSwagger =
    swaggerExplicit === 'true' ||
    (swaggerExplicit !== 'false' &&
      configService.get<string>('NODE_ENV') !== 'production');
  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('Opus Populi Prompt Service')
      .setDescription(
        'Private AI Prompt Service — serves prompt templates to federated nodes',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }

  const port = configService.get<number>('PORT', 3200);

  await app.listen(port);
  logger.log(`Prompt Service running on port ${port}`);
  if (enableSwagger) {
    logger.log(`Swagger docs at http://localhost:${port}/api`);
  }
}

bootstrap().catch((err) => {
  // Use console.error directly — the Nest logger may not be initialized if
  // bootstrap failed early. We want a visible failure plus a non-zero exit
  // so the orchestrator restarts and the alert fires.
  // eslint-disable-next-line no-console
  console.error('Failed to bootstrap prompt-service:', err);
  process.exit(1);
});
