import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma.module';
import { HealthModule } from './health/health.module';
import { PromptsModule } from './prompts/prompts.module';
import { AdminModule } from './admin/admin.module';
import { ExperimentsModule } from './experiments/experiments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    HealthModule,
    PromptsModule,
    AdminModule,
    ExperimentsModule,
  ],
})
export class AppModule {}
