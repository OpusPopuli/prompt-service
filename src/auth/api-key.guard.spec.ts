import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeyGuard } from './api-key.guard';

function createMockPrisma() {
  return {
    node: {
      findFirst: jest.fn(),
    },
  };
}

function createMockContext(authHeader?: string) {
  const request: Record<string, unknown> = {
    headers: authHeader ? { authorization: authHeader } : {},
  };

  return {
    ctx: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
    request,
  };
}

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue('ca:key-1,tx:key-2,ny:key-3'),
    } as unknown as ConfigService;
    mockPrisma = createMockPrisma();
    guard = new ApiKeyGuard(configService, mockPrisma as never);
  });

  it('should allow a valid env var API key', async () => {
    const { ctx } = createMockContext('Bearer key-1');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('should reject missing Authorization header', async () => {
    const { ctx } = createMockContext();
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject non-Bearer auth', async () => {
    const { ctx } = createMockContext('Basic abc123');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject invalid API key not in env or DB', async () => {
    mockPrisma.node.findFirst.mockResolvedValue(null);
    const { ctx } = createMockContext('Bearer invalid-key');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should attach apiKey and region to request for env var keys', async () => {
    const { ctx, request } = createMockContext('Bearer key-2');

    await guard.canActivate(ctx);

    expect(request.apiKey).toBe('key-2');
    expect(request.region).toBe('tx');
    expect(request.nodeId).toBeUndefined();
  });

  it('should reject Bearer token with no key after space', async () => {
    mockPrisma.node.findFirst.mockResolvedValue(null);
    const { ctx } = createMockContext('Bearer ');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should handle empty API_KEYS config gracefully', async () => {
    const configService = {
      get: jest.fn().mockReturnValue(''),
    } as unknown as ConfigService;
    const emptyGuard = new ApiKeyGuard(
      configService,
      createMockPrisma() as never,
    );

    const { ctx } = createMockContext('Bearer some-key');
    // Should fall through to DB lookup since no env keys configured
    await expect(emptyGuard.canActivate(ctx)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should handle API_KEYS with multiple colons (key contains colon)', async () => {
    const configService = {
      get: jest.fn().mockReturnValue('ca:key:with:colons'),
    } as unknown as ConfigService;
    const colonGuard = new ApiKeyGuard(
      configService,
      createMockPrisma() as never,
    );

    const { ctx, request } = createMockContext('Bearer key:with:colons');
    await colonGuard.canActivate(ctx);

    expect(request.apiKey).toBe('key:with:colons');
    expect(request.region).toBe('ca');
  });

  it('should default to unknown region when no colon in key entry', async () => {
    const configService = {
      get: jest.fn().mockReturnValue('legacy-key'),
    } as unknown as ConfigService;
    const legacyGuard = new ApiKeyGuard(
      configService,
      createMockPrisma() as never,
    );

    const { ctx, request } = createMockContext('Bearer legacy-key');

    await legacyGuard.canActivate(ctx);

    expect(request.apiKey).toBe('legacy-key');
    expect(request.region).toBe('unknown');
  });

  describe('DB-backed node keys', () => {
    it('should authenticate with a valid certified node API key', async () => {
      mockPrisma.node.findFirst.mockResolvedValue({
        id: 'node-uuid-1',
        region: 'ca',
        apiKey: 'node-api-key',
        status: 'certified',
      });
      const { ctx, request } = createMockContext('Bearer node-api-key');

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(request.apiKey).toBe('node-api-key');
      expect(request.region).toBe('ca');
      expect(request.nodeId).toBe('node-uuid-1');
    });

    it('should query DB only when key not found in env vars', async () => {
      const { ctx } = createMockContext('Bearer key-1');

      await guard.canActivate(ctx);

      expect(mockPrisma.node.findFirst).not.toHaveBeenCalled();
    });

    it('should reject when node is not certified', async () => {
      mockPrisma.node.findFirst.mockResolvedValue(null);
      const { ctx } = createMockContext('Bearer uncertified-node-key');

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should query with correct certified + non-expired criteria', async () => {
      mockPrisma.node.findFirst.mockResolvedValue(null);
      const { ctx } = createMockContext('Bearer some-node-key');

      await guard.canActivate(ctx).catch(() => {});

      expect(mockPrisma.node.findFirst).toHaveBeenCalledWith({
        where: {
          apiKey: 'some-node-key',
          status: 'certified',
          certificationExpiresAt: { gt: expect.any(Date) },
        },
      });
    });

    it('should reject expired node certification (DB returns null for expired)', async () => {
      // When certificationExpiresAt is in the past, findFirst returns null
      mockPrisma.node.findFirst.mockResolvedValue(null);
      const { ctx } = createMockContext('Bearer expired-node-key');

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject pending node key (DB returns null for non-certified)', async () => {
      // When status is 'pending', findFirst returns null
      mockPrisma.node.findFirst.mockResolvedValue(null);
      const { ctx } = createMockContext('Bearer pending-node-key');

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should not set nodeId for env var keys', async () => {
      const { ctx, request } = createMockContext('Bearer key-3');

      await guard.canActivate(ctx);

      expect(request.nodeId).toBeUndefined();
      expect(request.region).toBe('ny');
    });
  });
});
