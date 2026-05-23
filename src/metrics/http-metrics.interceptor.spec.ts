import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { correlationStorage } from '../common/correlation.storage';
import type { Counter, Histogram } from 'prom-client';

const makeCounter = () => ({ inc: jest.fn() }) as unknown as Counter<string>;
const makeHistogram = () =>
  ({ observe: jest.fn() }) as unknown as Histogram<string>;

function makeContext(
  routePath: string,
  method: string,
  statusCode: number,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        route: { path: routePath },
        url: routePath,
        method,
      }),
      getResponse: () => ({ statusCode }),
    }),
  } as unknown as ExecutionContext;
}

function makeHandler(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

function makeErrorHandler(err: unknown): CallHandler {
  return { handle: () => throwError(() => err) };
}

describe('HttpMetricsInterceptor', () => {
  let counter: Counter<string>;
  let histogram: Histogram<string>;
  let interceptor: HttpMetricsInterceptor;

  beforeEach(() => {
    counter = makeCounter();
    histogram = makeHistogram();
    interceptor = new HttpMetricsInterceptor(counter, histogram);
  });

  it('increments request counter with correct labels on success', (done) => {
    const ctx = makeContext('/prompts/:name/hash', 'GET', 200);

    interceptor.intercept(ctx, makeHandler({})).subscribe({
      complete: () => {
        expect(counter.inc).toHaveBeenCalledWith({
          endpoint: '/prompts/:name/hash',
          method: 'GET',
          status: '200',
        });
        done();
      },
    });
  });

  it('observes histogram on success', (done) => {
    const ctx = makeContext('/prompts/structural-analysis', 'POST', 200);

    interceptor.intercept(ctx, makeHandler({})).subscribe({
      complete: () => {
        expect(histogram.observe).toHaveBeenCalledWith(
          { endpoint: '/prompts/structural-analysis', method: 'POST' },
          expect.any(Number),
        );
        done();
      },
    });
  });

  it('records 401 status on auth error', (done) => {
    const ctx = makeContext('/prompts/rag', 'POST', 200);
    const err = { status: 401, message: 'Unauthorized' };

    interceptor.intercept(ctx, makeErrorHandler(err)).subscribe({
      error: () => {
        expect(counter.inc).toHaveBeenCalledWith(
          expect.objectContaining({ status: '401' }),
        );
        done();
      },
    });
  });

  it('falls back to 500 for errors without status', (done) => {
    const ctx = makeContext('/prompts/rag', 'POST', 200);

    interceptor.intercept(ctx, makeErrorHandler(new Error('boom'))).subscribe({
      error: () => {
        expect(counter.inc).toHaveBeenCalledWith(
          expect.objectContaining({ status: '500' }),
        );
        done();
      },
    });
  });

  it('returns Express route template directly without modification', (done) => {
    const ctx = makeContext('/admin/nodes/:id', 'GET', 200);

    interceptor.intercept(ctx, makeHandler({})).subscribe({
      complete: () => {
        expect(counter.inc).toHaveBeenCalledWith(
          expect.objectContaining({ endpoint: '/admin/nodes/:id' }),
        );
        done();
      },
    });
  });

  it('normalizes UUID in raw URL when route template is absent', (done) => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          route: undefined,
          url: `/admin/nodes/${uuid}`,
          method: 'GET',
        }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;

    interceptor.intercept(ctx, makeHandler({})).subscribe({
      complete: () => {
        expect(counter.inc).toHaveBeenCalledWith(
          expect.objectContaining({ endpoint: '/admin/nodes/:id' }),
        );
        done();
      },
    });
  });

  it('normalizes numeric segments in raw URL when route template is absent', (done) => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          route: undefined,
          url: '/admin/nodes/42',
          method: 'GET',
        }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;

    interceptor.intercept(ctx, makeHandler({})).subscribe({
      complete: () => {
        expect(counter.inc).toHaveBeenCalledWith(
          expect.objectContaining({ endpoint: '/admin/nodes/:id' }),
        );
        done();
      },
    });
  });

  it('stamps endpoint into the ALS correlation store', (done) => {
    const ctx = makeContext('/prompts/rag', 'POST', 200);

    correlationStorage.run({ correlationId: 'test-cid' }, () => {
      interceptor.intercept(ctx, makeHandler({})).subscribe({
        complete: () => {
          expect(correlationStorage.getStore()?.endpoint).toBe('/prompts/rag');
          done();
        },
      });
    });
  });

  it('stamps nodeId into the ALS store when present on the request', (done) => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          route: { path: '/prompts/rag' },
          url: '/prompts/rag',
          method: 'POST',
          nodeId: 'node-abc',
        }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;

    correlationStorage.run({ correlationId: 'test-cid' }, () => {
      interceptor.intercept(ctx, makeHandler({})).subscribe({
        complete: () => {
          expect(correlationStorage.getStore()?.nodeId).toBe('node-abc');
          done();
        },
      });
    });
  });
});
