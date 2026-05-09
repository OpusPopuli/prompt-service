import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Bump body-parser limit. Default is 100KB; the civics-extraction
  // prompt template (~9KB) plus the inbound HTML/text content from a
  // crawled civics page can comfortably exceed that on Assembly
  // resources pages. Using `useBodyParser` (vs `app.use(json(...))`)
  // preserves the `rawBody: true` capture used by HMAC signature
  // verification in api-key.guard.
  app.useBodyParser('json', { limit: '5mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '5mb' });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

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

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3200);

  await app.listen(port);
  console.log(`Prompt Service running on port ${port}`);
  console.log(`Swagger docs at http://localhost:${port}/api`);
}

bootstrap();
