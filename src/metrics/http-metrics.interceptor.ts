import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { correlationStorage } from '../common/correlation.storage';

export const REQUEST_COUNT_METRIC = 'prompt_service_requests_total';
export const REQUEST_DURATION_METRIC =
  'prompt_service_request_duration_seconds';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric(REQUEST_COUNT_METRIC)
    private readonly requestCounter: Counter<string>,
    @InjectMetric(REQUEST_DURATION_METRIC)
    private readonly requestDuration: Histogram<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const endpoint = this.normalizeRoute(req);
    const method = req.method as string;
    const start = Date.now();

    // Stamp request metadata into the ALS store so every log line in this
    // request carries the same endpoint and nodeId without explicit passing.
    // nodeId is set by ApiKeyGuard after auth — it may be absent on
    // unauthenticated routes (health, metrics).
    const store = correlationStorage.getStore();
    if (store) {
      store.endpoint = endpoint;
      if (req.nodeId) store.nodeId = req.nodeId as string;
    }

    return next.handle().pipe(
      tap(() => {
        const status = String(context.switchToHttp().getResponse().statusCode);
        this.requestCounter.inc({ endpoint, method, status });
        this.requestDuration.observe(
          { endpoint, method },
          (Date.now() - start) / 1000,
        );
      }),
      catchError((err: unknown) => {
        const status = this.errorStatus(err);
        this.requestCounter.inc({ endpoint, method, status });
        this.requestDuration.observe(
          { endpoint, method },
          (Date.now() - start) / 1000,
        );
        return throwError(() => err);
      }),
    );
  }

  private normalizeRoute(req: {
    route?: { path: string };
    url: string;
  }): string {
    // Express route templates already use :param notation — return them directly
    // to avoid double-processing and keep cardinality bounded.
    // Fallback to raw URL normalization only when route template is unavailable
    // (e.g., 404s, middleware-only requests).
    if (req.route?.path) return req.route.path;
    return req.url
      .replace(
        /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        '/:id',
      )
      .replace(/\/\d+(?=\/|$)/g, '/:id');
  }

  private errorStatus(err: unknown): string {
    if (err && typeof err === 'object' && 'status' in err) {
      return String((err as { status: number }).status);
    }
    return '500';
  }
}
