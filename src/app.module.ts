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

// Global IP-based throttle. Default 60/min covers a single legitimate
// user's traffic comfortably while still bounding brute-force attempts.
// Raised in integration test envs (single container IP → single bucket
// for the entire suite) via GLOBAL_THROTTLE_LIMIT. Mirrors the
// ADMIN_THROTTLE_LIMIT pattern used for admin endpoints.
const GLOBAL_THROTTLE_LIMIT = Number.parseInt(
  process.env.GLOBAL_THROTTLE_LIMIT ?? '60',
  10,
);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: GLOBAL_THROTTLE_LIMIT }]),
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
