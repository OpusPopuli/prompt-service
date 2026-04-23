import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';
import { ApiKeyGuard } from './api-key.guard';

function createMockPrisma() {
  return {
    node: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
  };
}

function createMockVault() {
  return {
    getSecretsByPrefix: jest.fn().mockResolvedValue([]),
    getSecret: jest.fn(),
    createSecret: jest.fn(),
    deleteSecret: jest.fn(),
  };
}

function createMockContext(headers: Record<string, string> = {}) {
  const request: Record<string, unknown> = {
    headers,
    method: 'POST',
    path: '/prompts/rag',
  };

  return {
    ctx: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
    request,
  };
}

function createBearerContext(authHeader?: string) {
  return createMockContext(authHeader ? { authorization: authHeader } : {});
}

/** Helper to compute an HMAC signature for tests. */
function computeHmac(
  apiKey: string,
  timestamp: string,
  method: string,
  path: string,
  body: string,
): string {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const signatureString = `${timestamp}\n${method}\n${path}\n${bodyHash}`;
  return createHmac('sha256', apiKey).update(signatureString).digest('base64');
}

function createHmacContext(
  apiKey: string,
  nodeId: string,
  body: string = '{"context":"test","query":"test"}',
  timestampOverride?: string,
) {
  const timestamp =
    timestampOverride ?? Math.floor(Date.now() / 1000).toString();
  const method = 'POST';
  const path = '/prompts/rag';
  const signature = computeHmac(apiKey, timestamp, method, path, body);

  const { ctx, request } = createMockContext({
    'x-hmac-signature': signature,
    'x-hmac-timestamp': timestamp,
    'x-hmac-key-id': nodeId,
    'content-type': 'application/json',
  });

  request.rawBody = Buffer.from(body);
  return { ctx, request };
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
    const { ctx } = createBearerContext('Bearer key-1');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('should reject missing Authorization header', async () => {
    const { ctx } = createBearerContext();
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject non-Bearer auth', async () => {
    const { ctx } = createBearerContext('Basic abc123');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject invalid API key not in env or DB', async () => {
    mockPrisma.node.findFirst.mockResolvedValue(null);
    const { ctx } = createBearerContext('Bearer invalid-key');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should attach apiKey and region to request for env var keys', async () => {
    const { ctx, request } = createBearerContext('Bearer key-2');

    await guard.canActivate(ctx);

    expect(request.apiKey).toBe('key-2');
    expect(request.region).toBe('tx');
    expect(request.nodeId).toBeUndefined();
  });

  it('should reject Bearer token with no key after space', async () => {
    mockPrisma.node.findFirst.mockResolvedValue(null);
    const { ctx } = createBearerContext('Bearer ');
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

    const { ctx } = createBearerContext('Bearer some-key');
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

    const { ctx, request } = createBearerContext('Bearer key:with:colons');
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

    const { ctx, request } = createBearerContext('Bearer legacy-key');

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
      const { ctx, request } = createBearerContext(`Bearer ${nodeKey}`);

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(request.apiKey).toBe(nodeKey);
      expect(request.region).toBe('ca');
      expect(request.nodeId).toBe('node-uuid-1');
    });

    it('should query DB with hashed token', async () => {
      mockPrisma.node.findFirst.mockResolvedValue(null);
      const { ctx } = createBearerContext('Bearer some-node-key');

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
      const { ctx } = createBearerContext('Bearer key-1');

      await guard.canActivate(ctx);

      expect(mockPrisma.node.findFirst).not.toHaveBeenCalled();
    });

    it('should reject when node is not certified', async () => {
      mockPrisma.node.findFirst.mockResolvedValue(null);
      const { ctx } = createBearerContext('Bearer uncertified-node-key');

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject expired node certification (DB returns null for expired)', async () => {
      mockPrisma.node.findFirst.mockResolvedValue(null);
      const { ctx } = createBearerContext('Bearer expired-node-key');

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject pending node key (DB returns null for non-certified)', async () => {
      mockPrisma.node.findFirst.mockResolvedValue(null);
      const { ctx } = createBearerContext('Bearer pending-node-key');

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should not set nodeId for env var keys', async () => {
      const { ctx, request } = createBearerContext('Bearer key-3');

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

      const { ctx, request } = createBearerContext('Bearer vault-fl-key');
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(request.region).toBe('fl');
    });

    it('should fall back to env var keys when Vault fails', async () => {
      mockVault.getSecretsByPrefix.mockRejectedValue(
        new Error('Vault unavailable'),
      );

      await guard.onModuleInit();

      const { ctx } = createBearerContext('Bearer key-1');
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('should merge Vault keys with env var keys', async () => {
      mockVault.getSecretsByPrefix.mockResolvedValue([
        { name: 'region_key_fl', secret: 'vault-fl-key' },
      ]);

      await guard.onModuleInit();

      const { ctx: ctx1 } = createBearerContext('Bearer key-1');
      await expect(guard.canActivate(ctx1)).resolves.toBe(true);

      const { ctx: ctx2 } = createBearerContext('Bearer vault-fl-key');
      await expect(guard.canActivate(ctx2)).resolves.toBe(true);
    });
  });

  describe('HMAC authentication', () => {
    const nodeId = 'hmac-node-uuid';
    const apiKey = 'test-hmac-api-key-64chars-hex-padded-to-reach-length';
    const certifiedNode = {
      id: nodeId,
      region: 'ca',
      status: 'certified',
      apiKeySecretId: 'vault-secret-uuid',
      certificationExpiresAt: new Date(Date.now() + 86400000), // +1 day
    };

    it('should authenticate with valid HMAC signature', async () => {
      mockPrisma.node.findUnique.mockResolvedValue(certifiedNode);
      mockVault.getSecret.mockResolvedValue(apiKey);

      const { ctx, request } = createHmacContext(apiKey, nodeId);

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(request.region).toBe('ca');
      expect(request.nodeId).toBe(nodeId);
      // Downstream audit logging expects req.apiKey to be populated in
      // both auth paths — without this, apiKey.slice(...) throws on the
      // HMAC path and surfaces as a 500.
      expect(request.apiKey).toBe(apiKey);
    });

    it('should reject expired timestamp (past)', async () => {
      const expiredTimestamp = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 min ago
      const { ctx } = createHmacContext(
        apiKey,
        nodeId,
        '{"test":"body"}',
        expiredTimestamp,
      );

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'HMAC timestamp expired',
      );
    });

    it('should reject future timestamp beyond window', async () => {
      const futureTimestamp = (Math.floor(Date.now() / 1000) + 600).toString(); // 10 min ahead
      const { ctx } = createHmacContext(
        apiKey,
        nodeId,
        '{"test":"body"}',
        futureTimestamp,
      );

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'HMAC timestamp expired',
      );
    });

    it('should reject invalid signature', async () => {
      mockPrisma.node.findUnique.mockResolvedValue(certifiedNode);
      mockVault.getSecret.mockResolvedValue(apiKey);

      const { ctx, request } = createHmacContext(apiKey, nodeId);
      // Tamper with the signature
      request.headers = {
        ...(request.headers as Record<string, string>),
        'x-hmac-signature': 'dGFtcGVyZWQgc2lnbmF0dXJl',
      };

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'Invalid HMAC signature',
      );
    });

    it('should reject when body is tampered after signing', async () => {
      mockPrisma.node.findUnique.mockResolvedValue(certifiedNode);
      mockVault.getSecret.mockResolvedValue(apiKey);

      const originalBody = '{"context":"original","query":"test"}';
      const { ctx, request } = createHmacContext(apiKey, nodeId, originalBody);
      // Tamper with the body after signing
      request.rawBody = Buffer.from('{"context":"tampered","query":"test"}');

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'Invalid HMAC signature',
      );
    });

    it('should reject unknown node ID', async () => {
      mockPrisma.node.findUnique.mockResolvedValue(null);

      const { ctx } = createHmacContext(apiKey, 'non-existent-node');

      await expect(guard.canActivate(ctx)).rejects.toThrow('Unknown node');
    });

    it('should reject decertified node', async () => {
      mockPrisma.node.findUnique.mockResolvedValue({
        ...certifiedNode,
        status: 'decertified',
      });

      const { ctx } = createHmacContext(apiKey, nodeId);

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'Node is not certified',
      );
    });

    it('should reject node with expired certification', async () => {
      mockPrisma.node.findUnique.mockResolvedValue({
        ...certifiedNode,
        certificationExpiresAt: new Date(Date.now() - 86400000), // expired
      });

      const { ctx } = createHmacContext(apiKey, nodeId);

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'Node is not certified',
      );
    });

    it('should reject when Vault key retrieval fails', async () => {
      mockPrisma.node.findUnique.mockResolvedValue(certifiedNode);
      mockVault.getSecret.mockRejectedValue(new Error('Vault error'));

      const { ctx } = createHmacContext(apiKey, nodeId);

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'Failed to retrieve node key',
      );
    });

    it('should reject missing HMAC headers', async () => {
      // Has signature but missing timestamp and key-id
      const { ctx } = createMockContext({
        'x-hmac-signature': 'some-sig',
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'Missing HMAC headers',
      );
    });

    it('should reject invalid (non-numeric) timestamp', async () => {
      const { ctx } = createMockContext({
        'x-hmac-signature': 'some-sig',
        'x-hmac-timestamp': 'not-a-number',
        'x-hmac-key-id': nodeId,
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'Invalid HMAC timestamp',
      );
    });

    it('should fall through to Bearer when no HMAC headers present', async () => {
      const { ctx } = createBearerContext('Bearer key-1');

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(mockPrisma.node.findUnique).not.toHaveBeenCalled();
    });

    it('should handle empty body (GET-like requests)', async () => {
      mockPrisma.node.findUnique.mockResolvedValue(certifiedNode);
      mockVault.getSecret.mockResolvedValue(apiKey);

      const { ctx, request } = createHmacContext(apiKey, nodeId, '');

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(request.nodeId).toBe(nodeId);
    });
  });
});
