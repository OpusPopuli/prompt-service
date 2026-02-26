import { NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PromptsService } from './prompts.service';

// Mock PrismaService
function createMockPrisma() {
  return {
    promptTemplate: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    promptRequestLog: {
      create: jest.fn(),
    },
  };
}

describe('PromptsService', () => {
  let service: PromptsService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new PromptsService(prisma as never);
  });

  describe('getStructuralAnalysisPrompt', () => {
    it('should return rendered structural analysis prompt', async () => {
      const baseTemplate = {
        id: '1',
        name: 'structural-analysis',
        templateText:
          'Analyze {{DATA_TYPE}} with goal: {{CONTENT_GOAL}}. Schema: {{SCHEMA_DESCRIPTION}}. {{HINTS_SECTION}} HTML: {{HTML}}',
        version: 1,
        isActive: true,
      };
      const schemaTemplate = {
        id: '2',
        name: 'structural-schema-propositions',
        templateText: 'Proposition schema fields',
        version: 1,
        isActive: true,
      };

      prisma.promptTemplate.findFirst
        .mockResolvedValueOnce(baseTemplate) // structural-analysis
        .mockResolvedValueOnce(schemaTemplate); // structural-schema-propositions
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getStructuralAnalysisPrompt(
        {
          dataType: 'propositions',
          contentGoal: 'Extract ballot measures',
          html: '<div>test</div>',
        },
        'test-key',
      );

      expect(result.promptText).toContain('propositions');
      expect(result.promptText).toContain('Extract ballot measures');
      expect(result.promptText).toContain('Proposition schema fields');
      expect(result.promptText).toContain('<div>test</div>');
      expect(result.promptHash).toBeDefined();
      expect(result.promptVersion).toBe('v1');
    });

    it('should include hints when provided', async () => {
      const template = {
        id: '1',
        name: 'structural-analysis',
        templateText: '{{HINTS_SECTION}}{{SCHEMA_DESCRIPTION}}',
        version: 1,
        isActive: true,
      };
      const schemaTemplate = {
        id: '2',
        name: 'structural-schema-default',
        templateText: 'default schema',
        version: 1,
        isActive: true,
      };

      prisma.promptTemplate.findFirst
        .mockResolvedValueOnce(template)
        .mockResolvedValueOnce(schemaTemplate);
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getStructuralAnalysisPrompt(
        {
          dataType: 'custom',
          contentGoal: 'goal',
          hints: ['Use table rows', 'Date is in header'],
          html: '<table></table>',
        },
        'test-key',
      );

      expect(result.promptText).toContain('Use table rows');
      expect(result.promptText).toContain('Date is in header');
    });

    it('should fall back to default schema when specific type not found', async () => {
      const template = {
        id: '1',
        name: 'structural-analysis',
        templateText: 'Schema: {{SCHEMA_DESCRIPTION}}',
        version: 2,
        isActive: true,
      };
      const defaultSchema = {
        id: '3',
        name: 'structural-schema-default',
        templateText: 'Extract all fields',
        version: 1,
        isActive: true,
      };

      prisma.promptTemplate.findFirst
        .mockResolvedValueOnce(template)
        .mockResolvedValueOnce(null) // specific schema not found
        .mockResolvedValueOnce(defaultSchema); // fallback
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getStructuralAnalysisPrompt(
        {
          dataType: 'unknown_type',
          contentGoal: 'goal',
          html: '<div></div>',
        },
        'test-key',
      );

      expect(result.promptText).toContain('Extract all fields');
    });
  });

  describe('getDocumentAnalysisPrompt', () => {
    it('should return rendered document analysis prompt', async () => {
      const template = {
        id: '1',
        name: 'document-analysis-petition',
        templateText: 'Analyze petition: {{TEXT}}',
        version: 1,
        isActive: true,
      };
      const baseInstructions = {
        id: '2',
        name: 'document-analysis-base-instructions',
        templateText: 'Respond with valid JSON only.',
        version: 1,
        isActive: true,
      };

      prisma.promptTemplate.findFirst
        .mockResolvedValueOnce(template)
        .mockResolvedValueOnce(baseInstructions);
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getDocumentAnalysisPrompt(
        { documentType: 'petition', text: 'We the people...' },
        'test-key',
      );

      expect(result.promptText).toContain('We the people...');
      expect(result.promptText).toContain('Respond with valid JSON only.');
      expect(result.promptVersion).toBe('v1');
    });

    it('should fall back to generic when specific type not found', async () => {
      const generic = {
        id: '1',
        name: 'document-analysis-generic',
        templateText: 'Generic: {{TEXT}}',
        version: 1,
        isActive: true,
      };
      const baseInstructions = {
        id: '2',
        name: 'document-analysis-base-instructions',
        templateText: 'JSON only.',
        version: 1,
        isActive: true,
      };

      prisma.promptTemplate.findFirst
        .mockResolvedValueOnce(null) // specific not found
        .mockResolvedValueOnce(generic) // fallback to generic
        .mockResolvedValueOnce(baseInstructions);
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getDocumentAnalysisPrompt(
        { documentType: 'unknown', text: 'Some text' },
        'test-key',
      );

      expect(result.promptText).toContain('Generic: Some text');
    });

    it('should throw NotFoundException when no template found', async () => {
      prisma.promptTemplate.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await expect(
        service.getDocumentAnalysisPrompt(
          { documentType: 'nonexistent', text: 'text' },
          'test-key',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRagPrompt', () => {
    it('should return rendered RAG prompt', async () => {
      const template = {
        id: '1',
        name: 'rag',
        templateText: 'Context: {{CONTEXT}}\nQuestion: {{QUERY}}\nAnswer:',
        version: 3,
        isActive: true,
      };

      prisma.promptTemplate.findFirst.mockResolvedValue(template);
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getRagPrompt(
        { context: 'The sky is blue.', query: 'What color is the sky?' },
        'test-key',
      );

      expect(result.promptText).toContain('The sky is blue.');
      expect(result.promptText).toContain('What color is the sky?');
      expect(result.promptVersion).toBe('v3');
    });
  });

  describe('verifyPrompt', () => {
    it('should return valid for matching hash', async () => {
      const templateText = 'test template';
      const expectedHash = createHash('sha256')
        .update(templateText)
        .digest('hex');

      prisma.promptTemplate.findMany.mockResolvedValue([
        { name: 'test', templateText, version: 1 },
      ]);

      const result = await service.verifyPrompt(expectedHash, 'v1');
      expect(result.valid).toBe(true);
      expect(result.templateName).toBe('test');
    });

    it('should return invalid for non-matching hash', async () => {
      prisma.promptTemplate.findMany.mockResolvedValue([
        { name: 'test', templateText: 'some template', version: 1 },
      ]);

      const result = await service.verifyPrompt('badhash', 'v1');
      expect(result.valid).toBe(false);
    });
  });

  describe('request logging', () => {
    it('should log prompt requests', async () => {
      const template = {
        id: '1',
        name: 'rag',
        templateText: '{{CONTEXT}} {{QUERY}}',
        version: 1,
        isActive: true,
      };

      prisma.promptTemplate.findFirst.mockResolvedValue(template);
      prisma.promptRequestLog.create.mockResolvedValue({});

      await service.getRagPrompt(
        { context: 'ctx', query: 'q' },
        'my-secret-key-123',
      );

      expect(prisma.promptRequestLog.create).toHaveBeenCalledWith({
        data: {
          endpoint: 'rag',
          promptVersion: 1,
          apiKeyPrefix: 'my-secre...',
        },
      });
    });
  });
});
