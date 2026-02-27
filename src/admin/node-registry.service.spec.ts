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

describe('NodeRegistryService', () => {
  let service: NodeRegistryService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new NodeRegistryService(prisma as never);
  });

  describe('registerNode', () => {
    it('should create node with generated API key and audit log', async () => {
      const dto = { name: 'node-ca-01', region: 'ca' };
      const created = {
        id: 'uuid-1',
        ...dto,
        apiKey: 'generated-key',
        status: 'pending',
      };

      prisma._tx.node.create.mockResolvedValue(created);
      prisma._tx.nodeAuditLog.create.mockResolvedValue({});

      const result = await service.registerNode(dto, 'admin-te...');

      expect(result).toEqual(created);
      expect(prisma._tx.node.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'node-ca-01',
          region: 'ca',
          publicKey: null,
          status: 'pending',
          apiKey: expect.any(String),
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

    it('should pass publicKey when provided', async () => {
      const dto = { name: 'node-tx-01', region: 'tx', publicKey: 'pk-123' };
      prisma._tx.node.create.mockResolvedValue({ id: '1', ...dto });
      prisma._tx.nodeAuditLog.create.mockResolvedValue({});

      await service.registerNode(dto, 'admin...');

      expect(prisma._tx.node.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ publicKey: 'pk-123' }),
      });
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
  });

  describe('rotateApiKey', () => {
    it('should generate a new API key and create audit log', async () => {
      prisma._tx.node.findUnique.mockResolvedValue({
        id: '1',
        apiKey: 'old-key',
      });
      prisma._tx.node.update.mockResolvedValue({
        id: '1',
        apiKey: 'new-key',
      });
      prisma._tx.nodeAuditLog.create.mockResolvedValue({});

      const result = await service.rotateApiKey('1', 'admin...');

      expect(prisma._tx.node.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { apiKey: expect.any(String) },
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

    it('should throw NotFoundException when not found', async () => {
      prisma._tx.node.findUnique.mockResolvedValue(null);

      await expect(
        service.rotateApiKey('nonexistent', 'admin...'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteNode', () => {
    it('should delete node and return confirmation', async () => {
      prisma.node.findUnique.mockResolvedValue({ id: '1' });
      prisma.node.delete.mockResolvedValue({});

      const result = await service.deleteNode('1');

      expect(result).toEqual({ deleted: true });
      expect(prisma.node.delete).toHaveBeenCalledWith({ where: { id: '1' } });
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
  });
});
