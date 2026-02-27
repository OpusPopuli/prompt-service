import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AdminService } from './admin.service';

function createMockPrisma() {
  const txMethods = {
    promptTemplate: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    promptVersionHistory: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  return {
    promptTemplate: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    promptVersionHistory: {
      findUnique: jest.fn(),
    },
    experiment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: typeof txMethods) => unknown) =>
      cb(txMethods),
    ),
    _tx: txMethods,
  };
}

describe('AdminService', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AdminService(prisma as never);
  });

  describe('listTemplates', () => {
    it('should return all templates when no filters', async () => {
      const templates = [
        { id: '1', name: 'template-a' },
        { id: '2', name: 'template-b' },
      ];
      prisma.promptTemplate.findMany.mockResolvedValue(templates);

      const result = await service.listTemplates({});

      expect(prisma.promptTemplate.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(templates);
    });

    it('should filter by category', async () => {
      prisma.promptTemplate.findMany.mockResolvedValue([]);

      await service.listTemplates({ category: 'rag' });

      expect(prisma.promptTemplate.findMany).toHaveBeenCalledWith({
        where: { category: 'rag' },
        orderBy: { name: 'asc' },
      });
    });

    it('should filter by isActive', async () => {
      prisma.promptTemplate.findMany.mockResolvedValue([]);

      await service.listTemplates({ isActive: true });

      expect(prisma.promptTemplate.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('getTemplateById', () => {
    it('should return template with version history', async () => {
      const template = {
        id: '1',
        name: 'test',
        versionHistory: [{ version: 2 }, { version: 1 }],
      };
      prisma.promptTemplate.findUnique.mockResolvedValue(template);

      const result = await service.getTemplateById('1');

      expect(result).toEqual(template);
      expect(prisma.promptTemplate.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        include: { versionHistory: { orderBy: { version: 'desc' } } },
      });
    });

    it('should throw NotFoundException when not found', async () => {
      prisma.promptTemplate.findUnique.mockResolvedValue(null);

      await expect(service.getTemplateById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createTemplate', () => {
    it('should create template and version history in transaction', async () => {
      const dto = {
        name: 'new-template',
        category: 'rag',
        description: 'A new template',
        templateText: 'Hello {{NAME}}',
        variables: ['NAME'],
        changeNote: 'First version',
      };

      const created = { id: 'uuid-1', ...dto, version: 1, isActive: true };
      prisma._tx.promptTemplate.create.mockResolvedValue(created);
      prisma._tx.promptVersionHistory.create.mockResolvedValue({});

      const result = await service.createTemplate(dto);

      expect(result).toEqual(created);
      expect(prisma._tx.promptTemplate.create).toHaveBeenCalledWith({
        data: {
          name: 'new-template',
          category: 'rag',
          description: 'A new template',
          templateText: 'Hello {{NAME}}',
          variables: ['NAME'],
        },
      });
      expect(prisma._tx.promptVersionHistory.create).toHaveBeenCalledWith({
        data: {
          templateId: 'uuid-1',
          version: 1,
          templateText: 'Hello {{NAME}}',
          templateHash: createHash('sha256')
            .update('Hello {{NAME}}')
            .digest('hex'),
          changeNote: 'First version',
        },
      });
    });

    it('should default changeNote to "Initial creation"', async () => {
      const dto = {
        name: 'test',
        category: 'rag',
        description: 'desc',
        templateText: 'text',
      };

      prisma._tx.promptTemplate.create.mockResolvedValue({
        id: '1',
        ...dto,
        version: 1,
      });
      prisma._tx.promptVersionHistory.create.mockResolvedValue({});

      await service.createTemplate(dto);

      expect(prisma._tx.promptVersionHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ changeNote: 'Initial creation' }),
        }),
      );
    });
  });

  describe('updateTemplate', () => {
    it('should increment version and create history entry', async () => {
      const existing = {
        id: '1',
        name: 'test',
        templateText: 'old text',
        version: 2,
      };
      const updated = { ...existing, templateText: 'new text', version: 3 };

      prisma._tx.promptTemplate.findUnique.mockResolvedValue(existing);
      prisma._tx.promptTemplate.update.mockResolvedValue(updated);
      prisma._tx.promptVersionHistory.create.mockResolvedValue({});

      const result = await service.updateTemplate('1', {
        templateText: 'new text',
        changeNote: 'Updated prompt wording',
      });

      expect(result.version).toBe(3);
      expect(prisma._tx.promptTemplate.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { version: 3, templateText: 'new text' },
      });
      expect(prisma._tx.promptVersionHistory.create).toHaveBeenCalledWith({
        data: {
          templateId: '1',
          version: 3,
          templateText: 'new text',
          templateHash: createHash('sha256').update('new text').digest('hex'),
          changeNote: 'Updated prompt wording',
        },
      });
    });

    it('should throw NotFoundException when template not found', async () => {
      prisma._tx.promptTemplate.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTemplate('nonexistent', {
          changeNote: 'test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteTemplate', () => {
    it('should set isActive to false', async () => {
      const template = { id: '1', name: 'test', isActive: true };
      prisma.promptTemplate.findUnique.mockResolvedValue(template);
      prisma.promptTemplate.update.mockResolvedValue({
        ...template,
        isActive: false,
      });

      const result = await service.deleteTemplate('1');

      expect(result.isActive).toBe(false);
      expect(prisma.promptTemplate.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { isActive: false },
      });
    });

    it('should throw NotFoundException when template not found', async () => {
      prisma.promptTemplate.findUnique.mockResolvedValue(null);

      await expect(service.deleteTemplate('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('rollbackTemplate', () => {
    it('should restore text from target version and increment version', async () => {
      const template = {
        id: '1',
        name: 'test',
        templateText: 'current v3',
        version: 3,
      };
      const targetHistory = {
        id: 'h1',
        templateId: '1',
        version: 1,
        templateText: 'original v1',
        templateHash: 'hash-v1',
      };
      const rolledBack = {
        ...template,
        templateText: 'original v1',
        version: 4,
      };

      prisma._tx.promptTemplate.findUnique.mockResolvedValue(template);
      prisma._tx.promptVersionHistory.findFirst.mockResolvedValue(
        targetHistory,
      );
      prisma._tx.promptTemplate.update.mockResolvedValue(rolledBack);
      prisma._tx.promptVersionHistory.create.mockResolvedValue({});

      const result = await service.rollbackTemplate('1', {
        targetVersion: 1,
        changeNote: 'Reverting bad change',
      });

      expect(result.version).toBe(4);
      expect(result.templateText).toBe('original v1');
      expect(prisma._tx.promptTemplate.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { templateText: 'original v1', version: 4 },
      });
      expect(prisma._tx.promptVersionHistory.create).toHaveBeenCalledWith({
        data: {
          templateId: '1',
          version: 4,
          templateText: 'original v1',
          templateHash: 'hash-v1',
          changeNote: 'Reverting bad change',
        },
      });
    });

    it('should use default changeNote when not provided', async () => {
      prisma._tx.promptTemplate.findUnique.mockResolvedValue({
        id: '1',
        version: 2,
      });
      prisma._tx.promptVersionHistory.findFirst.mockResolvedValue({
        templateText: 'v1 text',
        templateHash: 'h1',
      });
      prisma._tx.promptTemplate.update.mockResolvedValue({
        id: '1',
        version: 3,
      });
      prisma._tx.promptVersionHistory.create.mockResolvedValue({});

      await service.rollbackTemplate('1', { targetVersion: 1 });

      expect(prisma._tx.promptVersionHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            changeNote: 'Rollback to version 1',
          }),
        }),
      );
    });

    it('should throw when template not found', async () => {
      prisma._tx.promptTemplate.findUnique.mockResolvedValue(null);

      await expect(
        service.rollbackTemplate('nonexistent', { targetVersion: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when target version not found', async () => {
      prisma._tx.promptTemplate.findUnique.mockResolvedValue({
        id: '1',
        version: 3,
      });
      prisma._tx.promptVersionHistory.findFirst.mockResolvedValue(null);

      await expect(
        service.rollbackTemplate('1', { targetVersion: 99 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createExperiment', () => {
    it('should reject when traffic percentages do not sum to 100', async () => {
      const dto = {
        name: 'test-exp',
        templateId: 't1',
        variants: [
          { name: 'control', versionId: 'v1', trafficPct: 50 },
          { name: 'variant_a', versionId: 'v2', trafficPct: 30 },
        ],
      };

      await expect(service.createExperiment(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject when template not found', async () => {
      prisma.promptTemplate.findUnique.mockResolvedValue(null);

      const dto = {
        name: 'test-exp',
        templateId: 'nonexistent',
        variants: [
          { name: 'control', versionId: 'v1', trafficPct: 50 },
          { name: 'variant_a', versionId: 'v2', trafficPct: 50 },
        ],
      };

      await expect(service.createExperiment(dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should create experiment with variants', async () => {
      prisma.promptTemplate.findUnique.mockResolvedValue({ id: 't1' });
      prisma.promptVersionHistory.findUnique
        .mockResolvedValueOnce({ id: 'v1' })
        .mockResolvedValueOnce({ id: 'v2' });

      const created = {
        id: 'exp-1',
        name: 'test-exp',
        status: 'draft',
        variants: [
          { name: 'control', trafficPct: 50 },
          { name: 'variant_a', trafficPct: 50 },
        ],
      };
      prisma.experiment.create.mockResolvedValue(created);

      const dto = {
        name: 'test-exp',
        templateId: 't1',
        variants: [
          { name: 'control', versionId: 'v1', trafficPct: 50 },
          { name: 'variant_a', versionId: 'v2', trafficPct: 50 },
        ],
      };

      const result = await service.createExperiment(dto);

      expect(result.status).toBe('draft');
      expect(prisma.experiment.create).toHaveBeenCalled();
    });
  });

  describe('activateExperiment', () => {
    it('should reject if experiment not in draft status', async () => {
      prisma.experiment.findUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'active',
      });

      await expect(service.activateExperiment('exp-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject if another experiment is active for same template', async () => {
      prisma.experiment.findUnique.mockResolvedValue({
        id: 'exp-2',
        status: 'draft',
        templateId: 't1',
      });
      prisma.experiment.findFirst.mockResolvedValue({
        id: 'exp-1',
        name: 'existing-exp',
        status: 'active',
      });

      await expect(service.activateExperiment('exp-2')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should activate experiment from draft', async () => {
      prisma.experiment.findUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'draft',
        templateId: 't1',
      });
      prisma.experiment.findFirst.mockResolvedValue(null);
      prisma.experiment.update.mockResolvedValue({
        id: 'exp-1',
        status: 'active',
        variants: [],
      });

      const result = await service.activateExperiment('exp-1');

      expect(result.status).toBe('active');
    });
  });

  describe('stopExperiment', () => {
    it('should set status to stopped with timestamp', async () => {
      prisma.experiment.findUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'active',
      });
      prisma.experiment.update.mockResolvedValue({
        id: 'exp-1',
        status: 'stopped',
        stoppedAt: new Date(),
        variants: [],
      });

      const result = await service.stopExperiment('exp-1');

      expect(result.status).toBe('stopped');
      expect(prisma.experiment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'stopped' }),
        }),
      );
    });

    it('should throw when experiment not found', async () => {
      prisma.experiment.findUnique.mockResolvedValue(null);

      await expect(service.stopExperiment('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
