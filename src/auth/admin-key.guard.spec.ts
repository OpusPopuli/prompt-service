import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminKeyGuard } from './admin-key.guard';

function createMockVault() {
  return {
    getSecretsByPrefix: jest.fn().mockResolvedValue([]),
    createSecret: jest.fn(),
    deleteSecret: jest.fn(),
  };
}

function createMockContext(authHeader?: string): ExecutionContext {
  const request: Record<string, unknown> = {
    headers: authHeader ? { authorization: authHeader } : {},
  };

  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AdminKeyGuard', () => {
  let guard: AdminKeyGuard;
  let mockVault: ReturnType<typeof createMockVault>;

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue('admin-key-1,admin-key-2'),
    } as unknown as ConfigService;
    mockVault = createMockVault();
    guard = new AdminKeyGuard(configService, mockVault as never);
  });

  it('should allow a valid admin API key', () => {
    const ctx = createMockContext('Bearer admin-key-1');
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

  it('should reject invalid admin API key', () => {
    const ctx = createMockContext('Bearer invalid-key');
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should attach adminKey to request on success', () => {
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer admin-key-2' },
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    guard.canActivate(ctx);
    expect(request.adminKey).toBe('admin-key-2');
  });

  describe('Vault key loading', () => {
    it('should load admin keys from Vault on init', async () => {
      mockVault.getSecretsByPrefix.mockResolvedValue([
        { name: 'admin_key_1', secret: 'vault-admin-key' },
      ]);

      await guard.onModuleInit();

      const ctx = createMockContext('Bearer vault-admin-key');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should fall back to env var keys when Vault fails', async () => {
      mockVault.getSecretsByPrefix.mockRejectedValue(
        new Error('Vault unavailable'),
      );

      await guard.onModuleInit();

      // Env var keys should still work
      const ctx = createMockContext('Bearer admin-key-1');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should merge Vault keys with env var keys', async () => {
      mockVault.getSecretsByPrefix.mockResolvedValue([
        { name: 'admin_key_3', secret: 'vault-admin-key-3' },
      ]);

      await guard.onModuleInit();

      // Env var key still works
      const ctx1 = createMockContext('Bearer admin-key-1');
      expect(guard.canActivate(ctx1)).toBe(true);

      // Vault key also works
      const ctx2 = createMockContext('Bearer vault-admin-key-3');
      expect(guard.canActivate(ctx2)).toBe(true);
    });
  });
});
