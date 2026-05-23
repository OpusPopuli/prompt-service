import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
  PrometheusModule,
  makeCounterProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';
import {
  HttpMetricsInterceptor,
  REQUEST_COUNT_METRIC,
  REQUEST_DURATION_METRIC,
} from './http-metrics.interceptor';

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: true },
    }),
  ],
  providers: [
    makeCounterProvider({
      name: REQUEST_COUNT_METRIC,
      help: 'Total HTTP requests processed by prompt-service',
      labelNames: ['endpoint', 'method', 'status'],
    }),
    makeHistogramProvider({
      name: REQUEST_DURATION_METRIC,
      help: 'HTTP request duration in seconds',
      labelNames: ['endpoint', 'method'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    }),
    HttpMetricsInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useExisting: HttpMetricsInterceptor,
    },
  ],
})
export class MetricsModule {}
