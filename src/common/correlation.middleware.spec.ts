import { CorrelationMiddleware } from './correlation.middleware';
import { correlationStorage } from './correlation.storage';

const makeReq = (headers: Record<string, string> = {}) =>
  ({ headers }) as unknown as import('express').Request;

const makeRes = () => {
  const headers: Record<string, string> = {};
  return {
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
    _headers: headers,
  } as unknown as import('express').Response & {
    _headers: Record<string, string>;
  };
};

describe('CorrelationMiddleware', () => {
  let middleware: CorrelationMiddleware;

  beforeEach(() => {
    middleware = new CorrelationMiddleware();
  });

  it('generates a UUID correlation ID when no header present', (done) => {
    const req = makeReq();
    const res = makeRes();

    middleware.use(req, res, () => {
      const store = correlationStorage.getStore();
      expect(store?.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(res._headers['x-correlation-id']).toBe(store?.correlationId);
      done();
    });
  });

  it('propagates existing correlation ID from header', (done) => {
    const existing = 'test-correlation-id-123';
    const req = makeReq({ 'x-correlation-id': existing });
    const res = makeRes();

    middleware.use(req, res, () => {
      const store = correlationStorage.getStore();
      expect(store?.correlationId).toBe(existing);
      expect(res._headers['x-correlation-id']).toBe(existing);
      done();
    });
  });

  it('ignores an oversized correlation ID and generates a new UUID', (done) => {
    const oversized = 'a'.repeat(129);
    const req = makeReq({ 'x-correlation-id': oversized });
    const res = makeRes();

    middleware.use(req, res, () => {
      const store = correlationStorage.getStore();
      expect(store?.correlationId).not.toBe(oversized);
      expect(store?.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      done();
    });
  });
});
