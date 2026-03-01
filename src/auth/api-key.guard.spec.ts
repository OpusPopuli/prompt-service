import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { ApiKeyGuard } from './api-key.guard';

function createMockPrisma() {
  return {
    node: {
      findFirst: jest.fn(),
    },
  };
}

function createMockVault() {
  return {
    getSecretsByPrefix: jest.fn().mockResolvedValue([]),
    createSecret: jest.fn(),
    deleteSecret: jest.fn(),
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
  let mockVault: ReturnType<typeof createMockVault>;

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue('ca:key-1,tx:key-2,ny:key-3'),
    } as unknown as ConfigService;
    mockPrisma = createMockPrisma();
    mockVault = createMockVault();
    guard = new ApiKeyGuard(
      configService,
      mockPrisma as never,
      mockVault as never,
    );
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
      createMockVault() as never,
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
      createMockVault() as never,
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
      createMockVault() as never,
    );

    const { ctx, request } = createMockContext('Bearer legacy-key');

    await legacyGuard.canActivate(ctx);

    expect(request.apiKey).toBe('legacy-key');
    expect(request.region).toBe('unknown');
  });

  describe('DB-backed node keys', () => {
    it('should authenticate with a valid certified node via hash lookup', async () => {
      const nodeKey = 'node-api-key';
      const nodeKeyHash = createHash('sha256').update(nodeKey).digest('hex');

      mockPrisma.node.findFirst.mockResolvedValue({
        id: 'node-uuid-1',
        region: 'ca',
        apiKeyHash: nodeKeyHash,
        status: 'certified',
      });
      const { ctx, request } = createMockContext(`Bearer ${nodeKey}`);

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(request.apiKey).toBe(nodeKey);
      expect(request.region).toBe('ca');
      expect(request.nodeId).toBe('node-uuid-1');
    });

    it('should query DB with hashed token', async () => {
      mockPrisma.node.findFirst.mockResolvedValue(null);
      const { ctx } = createMockContext('Bearer some-node-key');

      await guard.canActivate(ctx).catch(() => {});

      const expectedHash = createHash('sha256')
        .update('some-node-key')
        .digest('hex');
      expect(mockPrisma.node.findFirst).toHaveBeenCalledWith({
        where: {
          apiKeyHash: expectedHash,
          status: 'certified',
          certificationExpiresAt: { gt: expect.any(Date) },
        },
      });
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

    it('should reject expired node certification (DB returns null for expired)', async () => {
      mockPrisma.node.findFirst.mockResolvedValue(null);
      const { ctx } = createMockContext('Bearer expired-node-key');

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject pending node key (DB returns null for non-certified)', async () => {
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

  describe('Vault key loading', () => {
    it('should load region keys from Vault on init', async () => {
      mockVault.getSecretsByPrefix.mockResolvedValue([
        { name: 'region_key_fl', secret: 'vault-fl-key' },
        { name: 'region_key_wa', secret: 'vault-wa-key' },
      ]);

      await guard.onModuleInit();

      const { ctx, request } = createMockContext('Bearer vault-fl-key');
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(request.region).toBe('fl');
    });

    it('should fall back to env var keys when Vault fails', async () => {
      mockVault.getSecretsByPrefix.mockRejectedValue(
        new Error('Vault unavailable'),
      );

      await guard.onModuleInit();

      // Env var keys should still work
      const { ctx } = createMockContext('Bearer key-1');
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('should merge Vault keys with env var keys', async () => {
      mockVault.getSecretsByPrefix.mockResolvedValue([
        { name: 'region_key_fl', secret: 'vault-fl-key' },
      ]);

      await guard.onModuleInit();

      // Env var key still works
      const { ctx: ctx1 } = createMockContext('Bearer key-1');
      await expect(guard.canActivate(ctx1)).resolves.toBe(true);

      // Vault key also works
      const { ctx: ctx2 } = createMockContext('Bearer vault-fl-key');
      await expect(guard.canActivate(ctx2)).resolves.toBe(true);
    });
  });
});
