import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeyGuard } from './api-key.guard';

function createMockContext(authHeader?: string): ExecutionContext {
  const request: Record<string, unknown> = {
    headers: authHeader ? { authorization: authHeader } : {},
  };

  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;

  beforeEach(() => {
    const configService = {
      get: jest
        .fn()
        .mockReturnValue('us-east:key-1,us-west:key-2,eu-west:key-3'),
    } as unknown as ConfigService;
    guard = new ApiKeyGuard(configService);
  });

  it('should allow a valid API key', () => {
    const ctx = createMockContext('Bearer key-1');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should reject missing Authorization header', () => {
    const ctx = createMockContext();
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should reject non-Bearer auth', () => {
    const ctx = createMockContext('Basic abc123');
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should reject invalid API key', () => {
    const ctx = createMockContext('Bearer invalid-key');
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should attach apiKey and region to request on success', () => {
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer key-2' },
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    guard.canActivate(ctx);
    expect(request.apiKey).toBe('key-2');
    expect(request.region).toBe('us-west');
  });

  it('should default to unknown region when no colon in key entry', () => {
    const configService = {
      get: jest.fn().mockReturnValue('legacy-key'),
    } as unknown as ConfigService;
    const legacyGuard = new ApiKeyGuard(configService);

    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer legacy-key' },
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    legacyGuard.canActivate(ctx);
    expect(request.apiKey).toBe('legacy-key');
    expect(request.region).toBe('unknown');
  });
});
