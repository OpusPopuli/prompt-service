import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma.module';
import { CorrelationMiddleware } from './common/correlation.middleware';
import { AllExceptionsFilter } from './common/exception.filter';
import { HealthModule } from './health/health.module';
import { PromptsModule } from './prompts/prompts.module';
import { AdminModule } from './admin/admin.module';
import { ExperimentsModule } from './experiments/experiments.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    HealthModule,
    PromptsModule,
    AdminModule,
    ExperimentsModule,
    MetricsModule,
  ],
  providers: [
    // Global throttler — covers admin endpoints that previously had zero
    // rate limiting. Buckets by IP (the global guard runs before the auth
    // guards, so no nodeId/apiKey is available yet). Per-route limits are
    // tightened via @Throttle on the admin controllers. The prompts
    // controller keeps NodeThrottlerGuard for per-node-key bucketing —
    // both guards run independently with different bucket keys. See #58.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Global exception filter — preserves the {statusCode, message, error}
    // response shape (currently-deployed @opuspopuli/prompt-client parses
    // those keys) and masks Prisma/unknown errors into a generic 500.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
