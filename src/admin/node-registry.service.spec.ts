import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NodeRegistryService } from './node-registry.service';

function createMockPrisma() {
  const txMethods = {
    node: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    nodeAuditLog: {
      create: jest.fn(),
    },
  };

  return {
    node: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    nodeAuditLog: {},
    $transaction: jest.fn((cb: (tx: typeof txMethods) => unknown) =>
      cb(txMethods),
    ),
    _tx: txMethods,
  };
}

function createMockVault() {
  return {
    createSecret: jest.fn().mockResolvedValue('vault-secret-uuid'),
    getSecret: jest.fn(),
    getSecretByName: jest.fn(),
    getSecretsByPrefix: jest.fn().mockResolvedValue([]),
    updateSecret: jest.fn(),
    deleteSecret: jest.fn().mockResolvedValue(undefined),
  };
}

describe('NodeRegistryService', () => {
  let service: NodeRegistryService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let vault: ReturnType<typeof createMockVault>;

  beforeEach(() => {
    prisma = createMockPrisma();
    vault = createMockVault();
    service = new NodeRegistryService(prisma as never, vault as never);
  });

  describe('registerNode', () => {
    it('should create node with generated API key, hash, and audit log', async () => {
      const dto = { name: 'node-ca-01', region: 'ca' };
      const created = {
        id: 'uuid-1',
        ...dto,
        apiKey: 'generated-key',
        apiKeyHash: 'generated-hash',
        status: 'pending',
      };

      prisma._tx.node.create.mockResolvedValue(created);
      prisma._tx.nodeAuditLog.create.mockResolvedValue({});
      prisma.node.update.mockResolvedValue(created);

      const result = await service.registerNode(dto, 'admin-te...');

      expect(result).toEqual(created);
      expect(prisma._tx.node.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'node-ca-01',
          region: 'ca',
          publicKey: null,
          status: 'pending',
          apiKey: expect.any(String),
          apiKeyHash: expect.any(String),
        }),
      });
      expect(prisma._tx.nodeAuditLog.create).toHaveBeenCalledWith({
        data: {
          nodeId: 'uuid-1',
          action: 'registered',
          performedBy: 'admin-te...',
        },
      });
    });

    it('should store API key in Vault after registration', async () => {
      const dto = { name: 'node-ca-01', region: 'ca' };
      prisma._tx.node.create.mockResolvedValue({
        id: 'uuid-1',
        name: 'node-ca-01',
        apiKey: 'gen-key',
      });
      prisma._tx.nodeAuditLog.create.mockResolvedValue({});
      prisma.node.update.mockResolvedValue({});

      await service.registerNode(dto, 'admin...');

      expect(vault.createSecret).toHaveBeenCalledWith(
        expect.any(String),
        'node_key_uuid-1',
        'API key for node node-ca-01',
      );
      expect(prisma.node.update).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        data: { apiKeySecretId: 'vault-secret-uuid' },
      });
    });

    it('should pass publicKey when provided', async () => {
      const dto = { name: 'node-tx-01', region: 'tx', publicKey: 'pk-123' };
      prisma._tx.node.create.mockResolvedValue({ id: '1', ...dto });
      prisma._tx.nodeAuditLog.create.mockResolvedValue({});

      await service.registerNode(dto, 'admin...');

      expect(prisma._tx.node.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ publicKey: 'pk-123' }),
      });
    });

    it('should handle Vault failure gracefully', async () => {
      const dto = { name: 'node-ca-01', region: 'ca' };
      prisma._tx.node.create.mockResolvedValue({
        id: 'uuid-1',
        name: 'node-ca-01',
      });
      prisma._tx.nodeAuditLog.create.mockResolvedValue({});
      vault.createSecret.mockRejectedValue(new Error('Vault unavailable'));

      // Should not throw
      const result = await service.registerNode(dto, 'admin...');
      expect(result).toBeDefined();
    });
  });

  describe('generateApiKey', () => {
    it('should generate a 64-character hex string', async () => {
      const dto = { name: 'node-key-test', region: 'ca' };
      prisma._tx.node.create.mockResolvedValue({
        id: '1',
        ...dto,
        apiKey: '',
        status: 'pending',
      });
      prisma._tx.nodeAuditLog.create.mockResolvedValue({});

      await service.registerNode(dto, 'admin...');

      const createCall = prisma._tx.node.create.mock.calls[0][0];
      expect(createCall.data.apiKey).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate a valid SHA-256 hash alongside the key', async () => {
      const dto = { name: 'node-hash-test', region: 'ca' };
      prisma._tx.node.create.mockResolvedValue({ id: '1' });
      prisma._tx.nodeAuditLog.create.mockResolvedValue({});

      await service.registerNode(dto, 'admin...');

      const createCall = prisma._tx.node.create.mock.calls[0][0];
      expect(createCall.data.apiKeyHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate unique keys on each call', async () => {
      prisma._tx.node.create.mockResolvedValue({ id: '1' });
      prisma._tx.nodeAuditLog.create.mockResolvedValue({});

      await service.registerNode({ name: 'a', region: 'ca' }, 'admin...');
      await service.registerNode({ name: 'b', region: 'ca' }, 'admin...');

      const key1 = prisma._tx.node.create.mock.calls[0][0].data.apiKey;
      const key2 = prisma._tx.node.create.mock.calls[1][0].data.apiKey;
      expect(key1).not.toBe(key2);
    });
  });

  describe('listNodes', () => {
    it('should return all nodes when no filters', async () => {
      const nodes = [{ id: '1', name: 'node-a' }];
      prisma.node.findMany.mockResolvedValue(nodes);

      const result = await service.listNodes({});

      expect(prisma.node.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(nodes);
    });

    it('should filter by region', async () => {
      prisma.node.findMany.mockResolvedValue([]);

      await service.listNodes({ region: 'ca' });

      expect(prisma.node.findMany).toHaveBeenCalledWith({
        where: { region: 'ca' },
        orderBy: { name: 'asc' },
      });
    });

    it('should filter by status', async () => {
      prisma.node.findMany.mockResolvedValue([]);

      await service.listNodes({ status: 'certified' });

      expect(prisma.node.findMany).toHaveBeenCalledWith({
        where: { status: 'certified' },
        orderBy: { name: 'asc' },
      });
    });

    it('should filter by region and status together', async () => {
      prisma.node.findMany.mockResolvedValue([]);

      await service.listNodes({ region: 'ca', status: 'certified' });

      expect(prisma.node.findMany).toHaveBeenCalledWith({
        where: { region: 'ca', status: 'certified' },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('getNode', () => {
    it('should return node with audit logs', async () => {
      const node = {
        id: '1',
        name: 'node-ca-01',
        auditLogs: [{ action: 'registered' }],
      };
      prisma.node.findUnique.mockResolvedValue(node);

      const result = await service.getNode('1');

      expect(result).toEqual(node);
      expect(prisma.node.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        include: { auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 } },
      });
    });

    it('should throw NotFoundException when not found', async () => {
      prisma.node.findUnique.mockResolvedValue(null);

      await expect(service.getNode('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateNode', () => {
    it('should update name and region', async () => {
      prisma.node.findUnique.mockResolvedValue({ id: '1', name: 'old' });
      prisma.node.update.mockResolvedValue({
        id: '1',
        name: 'new',
        region: 'tx',
      });

      const result = await service.updateNode('1', {
        name: 'new',
        region: 'tx',
      });

      expect(result.name).toBe('new');
      expect(prisma.node.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { name: 'new', region: 'tx' },
      });
    });

    it('should update only publicKey when other fields are undefined', async () => {
      prisma.node.findUnique.mockResolvedValue({ id: '1' });
      prisma.node.update.mockResolvedValue({ id: '1', publicKey: 'new-pk' });

      await service.updateNode('1', { publicKey: 'new-pk' });

      expect(prisma.node.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { publicKey: 'new-pk' },
      });
    });

    it('should throw NotFoundException when not found', async () => {
      prisma.node.findUnique.mockResolvedValue(null);

      await expect(
        service.updateNode('nonexistent', { name: 'new' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('certifyNode', () => {
    it('should set status to certified with expiration', async () => {
      prisma._tx.node.findUnique.mockResolvedValue({
        id: '1',
        status: 'pending',
      });
      prisma._tx.node.update.mockResolvedValue({
        id: '1',
        status: 'certified',
      });
      prisma._tx.nodeAuditLog.create.mockResolvedValue({});

      const result = await service.certifyNode(
        '1',
        { expiresInDays: 90 },
        'admin...',
      );

      expect(result.status).toBe('certified');
      expect(prisma._tx.node.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: {
          status: 'certified',
          certifiedAt: expect.any(Date),
          certificationExpiresAt: expect.any(Date),
        },
      });
      expect(prisma._tx.nodeAuditLog.create).toHaveBeenCalledWith({
        data: {
          nodeId: '1',
          action: 'certified',
          reason: undefined,
          performedBy: 'admin...',
        },
      });
    });

    it('should use default 365-day expiration when not specified', async () => {
      prisma._tx.node.findUnique.mockResolvedValue({
        id: '1',
        status: 'pending',
      });
      prisma._tx.node.update.mockResolvedValue({
        id: '1',
        status: 'certified',
      });
      prisma._tx.nodeAuditLog.create.mockResolvedValue({});

      await service.certifyNode('1', {}, 'admin...');

      const updateCall = prisma._tx.node.update.mock.calls[0][0];
      const expiresAt = new Date(updateCall.data.certificationExpiresAt);
      const now = new Date();
      const diffDays = Math.round(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(diffDays).toBeGreaterThanOrEqual(364);
      expect(diffDays).toBeLessThanOrEqual(366);
    });

    it('should allow re-certifying an already certified node', async () => {
      prisma._tx.node.findUnique.mockResolvedValue({
        id: '1',
        status: 'certified',
      });
      prisma._tx.node.update.mockResolvedValue({
        id: '1',
        status: 'certified',
      });
      prisma._tx.nodeAuditLog.create.mockResolvedValue({});

      const result = await service.certifyNode('1', {}, 'admin...');

      expect(result.status).toBe('certified');
    });

    it('should reject certifying a decertified node', async () => {
      prisma._tx.node.findUnique.mockResolvedValue({
        id: '1',
        status: 'decertified',
      });

      await expect(service.certifyNode('1', {}, 'admin...')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when not found', async () => {
      prisma._tx.node.findUnique.mockResolvedValue(null);

      await expect(
        service.certifyNode('nonexistent', {}, 'admin...'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('decertifyNode', () => {
    it('should set status to decertified with audit log', async () => {
      prisma._tx.node.findUnique.mockResolvedValue({
        id: '1',
        status: 'certified',
      });
      prisma._tx.node.update.mockResolvedValue({
        id: '1',
        status: 'decertified',
      });
      prisma._tx.nodeAuditLog.create.mockResolvedValue({});

      const result = await service.decertifyNode(
        '1',
        { reason: 'Terms violation' },
        'admin...',
      );

      expect(result.status).toBe('decertified');
      expect(prisma._tx.nodeAuditLog.create).toHaveBeenCalledWith({
        data: {
          nodeId: '1',
          action: 'decertified',
          reason: 'Terms violation',
          performedBy: 'admin...',
        },
      });
    });

    it('should throw NotFoundException when not found', async () => {
      prisma._tx.node.findUnique.mockResolvedValue(null);

      await expect(
        service.decertifyNode('nonexistent', { reason: 'test' }, 'admin...'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('recertifyNode', () => {
    it('should re-certify and clear decertifiedAt', async () => {
      prisma._tx.node.findUnique.mockResolvedValue({
        id: '1',
        status: 'decertified',
      });
      prisma._tx.node.update.mockResolvedValue({
        id: '1',
        status: 'certified',
        decertifiedAt: null,
      });
      prisma._tx.nodeAuditLog.create.mockResolvedValue({});

      const result = await service.recertifyNode('1', {}, 'admin...');

      expect(result.status).toBe('certified');
      expect(prisma._tx.node.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: {
          status: 'certified',
          certifiedAt: expect.any(Date),
          certificationExpiresAt: expect.any(Date),
          decertifiedAt: null,
        },
      });
      expect(prisma._tx.nodeAuditLog.create).toHaveBeenCalledWith({
        data: {
          nodeId: '1',
          action: 'recertified',
          reason: undefined,
          performedBy: 'admin...',
        },
      });
    });

    it('should throw NotFoundException when not found', async () => {
      prisma._tx.node.findUnique.mockResolvedValue(null);

      await expect(
        service.recertifyNode('nonexistent', {}, 'admin...'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rotateApiKey', () => {
    it('should generate a new API key with hash and create audit log', async () => {
      prisma.node.findUnique.mockResolvedValue({
        id: '1',
        apiKey: 'old-key',
        apiKeySecretId: 'old-secret-id',
      });
      prisma._tx.node.update.mockResolvedValue({
        id: '1',
        name: 'test-node',
        apiKey: 'new-key',
      });
      prisma._tx.nodeAuditLog.create.mockResolvedValue({});
      prisma.node.update.mockResolvedValue({});

      const result = await service.rotateApiKey('1', 'admin...');

      expect(prisma._tx.node.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: {
          apiKey: expect.any(String),
          apiKeyHash: expect.any(String),
        },
      });
      expect(prisma._tx.nodeAuditLog.create).toHaveBeenCalledWith({
        data: {
          nodeId: '1',
          action: 'key_rotated',
          performedBy: 'admin...',
        },
      });
      expect(result.apiKey).toBeDefined();
    });

    it('should store new key in Vault and delete old secret', async () => {
      prisma.node.findUnique.mockResolvedValue({
        id: '1',
        apiKey: 'old-key',
        apiKeySecretId: 'old-secret-id',
      });
      prisma._tx.node.update.mockResolvedValue({
        id: '1',
        name: 'test-node',
      });
      prisma._tx.nodeAuditLog.create.mockResolvedValue({});
      prisma.node.update.mockResolvedValue({});

      await service.rotateApiKey('1', 'admin...');

      expect(vault.createSecret).toHaveBeenCalledWith(
        expect.any(String),
        'node_key_1',
        expect.stringContaining('rotated'),
      );
      expect(vault.deleteSecret).toHaveBeenCalledWith('old-secret-id');
    });

    it('should throw NotFoundException when not found', async () => {
      prisma.node.findUnique.mockResolvedValue(null);

      await expect(
        service.rotateApiKey('nonexistent', 'admin...'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteNode', () => {
    it('should delete node, clean up Vault secret, and return confirmation', async () => {
      prisma.node.findUnique.mockResolvedValue({
        id: '1',
        apiKeySecretId: 'secret-id',
      });
      prisma.node.delete.mockResolvedValue({});

      const result = await service.deleteNode('1');

      expect(result).toEqual({ deleted: true });
      expect(prisma.node.delete).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(vault.deleteSecret).toHaveBeenCalledWith('secret-id');
    });

    it('should skip Vault cleanup when no secret ID', async () => {
      prisma.node.findUnique.mockResolvedValue({
        id: '1',
        apiKeySecretId: null,
      });
      prisma.node.delete.mockResolvedValue({});

      await service.deleteNode('1');

      expect(vault.deleteSecret).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when not found', async () => {
      prisma.node.findUnique.mockResolvedValue(null);

      await expect(service.deleteNode('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getHealthDashboard', () => {
    it('should return aggregated node status info', async () => {
      prisma.node.count.mockResolvedValue(5);
      prisma.node.groupBy.mockResolvedValue([
        { status: 'certified', _count: 3 },
        { status: 'pending', _count: 2 },
      ]);
      prisma.node.findMany
        .mockResolvedValueOnce([{ id: '1', name: 'expiring-node' }])
        .mockResolvedValueOnce([{ id: '2', name: 'new-node' }]);

      const result = await service.getHealthDashboard();

      expect(result.totalNodes).toBe(5);
      expect(result.byStatus).toEqual({ certified: 3, pending: 2 });
      expect(result.expiringIn30Days).toEqual([
        { id: '1', name: 'expiring-node' },
      ]);
      expect(result.recentlyRegistered).toEqual([
        { id: '2', name: 'new-node' },
      ]);
    });

    it('should handle empty database gracefully', async () => {
      prisma.node.count.mockResolvedValue(0);
      prisma.node.groupBy.mockResolvedValue([]);
      prisma.node.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.getHealthDashboard();

      expect(result.totalNodes).toBe(0);
      expect(result.byStatus).toEqual({});
      expect(result.expiringIn30Days).toEqual([]);
      expect(result.recentlyRegistered).toEqual([]);
    });
  });
});
