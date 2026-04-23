import { VaultService } from './vault.service';

function createMockPrisma() {
  return {
    $queryRaw: jest.fn(),
  };
}

describe('VaultService', () => {
  let service: VaultService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new VaultService(prisma as never);
  });

  describe('createSecret', () => {
    it('should create a secret and return its ID', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'secret-uuid-1' }]);

      const result = await service.createSecret(
        'my-secret-value',
        'my_secret',
        'A test secret',
      );

      expect(result).toBe('secret-uuid-1');
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should handle missing description', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'secret-uuid-2' }]);

      const result = await service.createSecret('value', 'name');

      expect(result).toBe('secret-uuid-2');
    });
  });

  describe('getSecret', () => {
    it('should return decrypted secret by ID', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { id: 'uuid', name: 'test', secret: 'decrypted-value' },
      ]);

      const result = await service.getSecret('uuid');

      expect(result).toBe('decrypted-value');
    });

    it('should return null when secret not found', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getSecret('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getSecretByName', () => {
    it('should return decrypted secret by name', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { id: 'uuid', name: 'region_key_ca', secret: 'ca-key-value' },
      ]);

      const result = await service.getSecretByName('region_key_ca');

      expect(result).toBe('ca-key-value');
    });

    it('should return null when not found', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getSecretByName('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getSecretsByPrefix', () => {
    it('should return all secrets matching prefix', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { id: '1', name: 'region_key_ca', secret: 'ca-key' },
        { id: '2', name: 'region_key_tx', secret: 'tx-key' },
      ]);

      const result = await service.getSecretsByPrefix('region_key_');

      expect(result).toEqual([
        { name: 'region_key_ca', secret: 'ca-key' },
        { name: 'region_key_tx', secret: 'tx-key' },
      ]);
    });

    it('should return empty array when no matches', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getSecretsByPrefix('nonexistent_');

      expect(result).toEqual([]);
    });

    it('should escape SQL LIKE wildcards in the prefix', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await service.getSecretsByPrefix('weird_%_\\prefix');

      // The template-tag values array is passed as the second arg to the
      // tagged template function; we assert the pattern value, not the SQL.
      const call = prisma.$queryRaw.mock.calls[0];
      const values = call.slice(1);
      expect(values).toContain('weird\\_\\%\\_\\\\prefix%');
    });
  });

  describe('onApplicationBootstrap', () => {
    const originalEnv = process.env.NODE_ENV;
    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should resolve silently when Vault is reachable', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });

    it('should throw in production when Vault is unreachable', async () => {
      process.env.NODE_ENV = 'production';
      prisma.$queryRaw.mockRejectedValue(new Error('vault offline'));

      await expect(service.onApplicationBootstrap()).rejects.toThrow(
        'vault offline',
      );
    });

    it('should warn but continue in dev when Vault is unreachable', async () => {
      process.env.NODE_ENV = 'development';
      prisma.$queryRaw.mockRejectedValue(new Error('vault offline'));

      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });
  });

  describe('updateSecret', () => {
    it('should update a secret value', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await service.updateSecret('secret-uuid', 'new-value');

      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('deleteSecret', () => {
    it('should delete a secret by ID', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await service.deleteSecret('secret-uuid');

      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
  });
});
