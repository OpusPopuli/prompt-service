import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './exception.filter';

interface MockResponse {
  status: jest.Mock;
  json: jest.Mock;
  _status?: number;
  _body?: Record<string, unknown>;
}

function createMockHost(): { host: ArgumentsHost; response: MockResponse } {
  const response: MockResponse = {
    status: jest.fn(),
    json: jest.fn(),
  };
  response.status.mockImplementation((s: number) => {
    response._status = s;
    return response;
  });
  response.json.mockImplementation((b: Record<string, unknown>) => {
    response._body = b;
    return response;
  });

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'POST', url: '/some/path' }),
    }),
  } as unknown as ArgumentsHost;

  return { host, response };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  describe('HttpException pass-through (preserves wire contract)', () => {
    it('preserves the {statusCode, message, error} shape for UnauthorizedException', () => {
      const { host, response } = createMockHost();

      filter.catch(new UnauthorizedException('Invalid API key'), host);

      expect(response._status).toBe(HttpStatus.UNAUTHORIZED);
      expect(response._body).toEqual(
        expect.objectContaining({
          statusCode: 401,
          message: 'Invalid API key',
          error: 'Unauthorized',
        }),
      );
    });

    it('preserves the shape for NotFoundException', () => {
      const { host, response } = createMockHost();

      filter.catch(
        new NotFoundException('Prompt template "rag" not found'),
        host,
      );

      expect(response._status).toBe(HttpStatus.NOT_FOUND);
      expect(response._body).toEqual(
        expect.objectContaining({
          statusCode: 404,
          message: 'Prompt template "rag" not found',
          error: 'Not Found',
        }),
      );
    });

    it('preserves the array-message shape that ValidationPipe emits', () => {
      const { host, response } = createMockHost();

      // ValidationPipe throws BadRequestException with body
      // { statusCode: 400, message: ['field must be string'], error: 'Bad Request' }
      filter.catch(
        new BadRequestException({
          statusCode: 400,
          message: ['field must be a string'],
          error: 'Bad Request',
        }),
        host,
      );

      expect(response._status).toBe(400);
      expect(response._body).toEqual(
        expect.objectContaining({
          statusCode: 400,
          message: ['field must be a string'],
          error: 'Bad Request',
        }),
      );
    });

    it('normalizes a string-body HttpException into the canonical shape', () => {
      const { host, response } = createMockHost();

      // Some manual `throw new HttpException('msg', status)` calls pass a string
      filter.catch(new HttpException('Custom message', 418), host);

      expect(response._status).toBe(418);
      const body = response._body as Record<string, unknown>;
      expect(body.statusCode).toBe(418);
      expect(body.message).toBe('Custom message');
      expect(body.error).toBeDefined();
    });
  });

  describe('Unknown exceptions are masked', () => {
    it('returns a generic 500 for a plain Error (e.g. Prisma error)', () => {
      const { host, response } = createMockHost();

      const prismaLike = new Error(
        'Invalid `prisma.node.findUnique()` invocation: connection refused at host=db.internal port=5432',
      );

      filter.catch(prismaLike, host);

      expect(response._status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(response._body).toEqual({
        statusCode: 500,
        message: 'Internal server error',
        error: 'Internal Server Error',
      });
    });

    it('never leaks Prisma error details to the client', () => {
      const { host, response } = createMockHost();

      const sensitive = new Error(
        'prisma error: invalid connection string postgresql://user:hunter2@db/foo',
      );

      filter.catch(sensitive, host);

      const body = response._body as Record<string, unknown>;
      expect(JSON.stringify(body)).not.toContain('prisma');
      expect(JSON.stringify(body)).not.toContain('hunter2');
      expect(JSON.stringify(body)).not.toContain('postgresql://');
    });

    it('masks non-Error throws (string, number, null) as 500', () => {
      const { host, response } = createMockHost();

      filter.catch('a string was thrown', host);

      expect(response._status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(response._body).toEqual({
        statusCode: 500,
        message: 'Internal server error',
        error: 'Internal Server Error',
      });
    });
  });

  describe('Error response shape invariants', () => {
    it.each([
      [new UnauthorizedException(), 401],
      [new NotFoundException(), 404],
      [new BadRequestException(), 400],
      [new Error('boom'), 500],
    ])(
      'always returns an object with statusCode, message, and error keys',
      (exception, expectedStatus) => {
        const { host, response } = createMockHost();

        filter.catch(exception, host);

        const body = response._body as Record<string, unknown>;
        expect(body).toHaveProperty('statusCode', expectedStatus);
        expect(body).toHaveProperty('message');
        expect(body).toHaveProperty('error');
      },
    );
  });
});
