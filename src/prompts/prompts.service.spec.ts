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
    promptVersionHistory: {
      findFirst: jest.fn(),
    },
    promptRequestLog: {
      create: jest.fn(),
    },
  };
}

function createMockConfig(overrides: Record<string, unknown> = {}) {
  return {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      if (key in overrides) return overrides[key];
      if (key === 'PROMPT_TTL_SECONDS') return 3600;
      return defaultValue;
    }),
  };
}

function createMockExperiments() {
  return {
    resolveExperiment: jest.fn().mockResolvedValue(null),
  };
}

describe('PromptsService', () => {
  let service: PromptsService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let config: ReturnType<typeof createMockConfig>;
  let experiments: ReturnType<typeof createMockExperiments>;

  beforeEach(() => {
    prisma = createMockPrisma();
    config = createMockConfig();
    experiments = createMockExperiments();
    service = new PromptsService(
      prisma as never,
      config as never,
      experiments as never,
    );
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
        .mockResolvedValueOnce(baseTemplate) // structural-analysis (from resolveTemplate fallback)
        .mockResolvedValueOnce(schemaTemplate); // structural-schema-propositions
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getStructuralAnalysisPrompt(
        {
          dataType: 'propositions',
          contentGoal: 'Extract ballot measures',
          html: '<div>test</div>',
        },
        'test-key',
        'ca',
      );

      expect(result.promptText).toContain('propositions');
      expect(result.promptText).toContain('Extract ballot measures');
      expect(result.promptText).toContain('Proposition schema fields');
      expect(result.promptText).toContain('<div>test</div>');
      expect(result.promptHash).toBeDefined();
      expect(result.promptVersion).toBe('v1');
      expect(result.expiresAt).toBeDefined();
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
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
        'ca',
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
        'ca',
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
        'ca',
      );

      expect(result.promptText).toContain('We the people...');
      expect(result.promptText).toContain('Respond with valid JSON only.');
      expect(result.promptVersion).toBe('v1');
      expect(result.expiresAt).toBeDefined();
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
        'ca',
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
          'ca',
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
        'ca',
      );

      expect(result.promptText).toContain('The sky is blue.');
      expect(result.promptText).toContain('What color is the sky?');
      expect(result.promptVersion).toBe('v3');
      expect(result.expiresAt).toBeDefined();
    });
  });

  describe('getCivicsExtractionPrompt', () => {
    it('returns rendered civics-extraction prompt with all interpolated fields', async () => {
      const template = {
        id: '1',
        name: 'civics-extraction',
        templateText:
          'Region: {{REGION_ID}}\nSource: {{SOURCE_URL}}\nGoal: {{CONTENT_GOAL}}\n{{CATEGORY}}{{HINTS}}HTML:\n{{HTML}}',
        version: 1,
        isActive: true,
      };

      prisma.promptTemplate.findFirst.mockResolvedValue(template);
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getCivicsExtractionPrompt(
        {
          regionId: 'california',
          sourceUrl: 'https://www.assembly.ca.gov/resources/glossary',
          contentGoal: 'Extract the official Assembly glossary',
          category: 'Assembly',
          hints: ['~150 terms organized A-Z'],
          html: '<html>...</html>',
        },
        'test-key',
        'ca',
      );

      expect(result.promptText).toContain('Region: california');
      expect(result.promptText).toContain(
        'Source: https://www.assembly.ca.gov/resources/glossary',
      );
      expect(result.promptText).toContain('Category: Assembly');
      expect(result.promptText).toContain('- ~150 terms organized A-Z');
      expect(result.promptText).toContain('<html>...</html>');
      expect(result.promptVersion).toBe('v1');
      expect(result.expiresAt).toBeDefined();
    });

    it('omits hints section when none provided', async () => {
      const template = {
        id: '1',
        name: 'civics-extraction',
        templateText: '{{HINTS}}END',
        version: 1,
        isActive: true,
      };
      prisma.promptTemplate.findFirst.mockResolvedValue(template);
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getCivicsExtractionPrompt(
        {
          regionId: 'california',
          sourceUrl: 'https://example.com',
          contentGoal: 'extract',
          html: '<p/>',
        },
        'test-key',
        'ca',
      );

      expect(result.promptText).toBe('END');
    });
  });

  describe('getBillExtractionPrompt', () => {
    it('returns rendered bill-extraction prompt with all interpolated fields', async () => {
      const template = {
        id: '1',
        name: 'bill-extraction',
        templateText:
          'Region: {{REGION_ID}}\nSource: {{SOURCE_URL}}\nSession: {{SESSION_YEAR}}\nHTML: {{HTML}}',
        version: 1,
        isActive: true,
      };

      prisma.promptTemplate.findFirst.mockResolvedValue(template);
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getBillExtractionPrompt(
        {
          regionId: 'california',
          sourceUrl:
            'https://leginfo.legislature.ca.gov/faces/billStatusClient.xhtml?bill_id=202520260AB1',
          sessionYear: '2025-2026',
          html: '<html>bill content</html>',
        },
        'test-key',
        'ca',
      );

      expect(result.promptText).toContain('Region: california');
      expect(result.promptText).toContain(
        'Source: https://leginfo.legislature.ca.gov/faces/billStatusClient.xhtml?bill_id=202520260AB1',
      );
      expect(result.promptText).toContain('Session: 2025-2026');
      expect(result.promptText).toContain('<html>bill content</html>');
      expect(result.promptVersion).toBe('v1');
      expect(result.expiresAt).toBeDefined();
    });

    it('throws NotFoundException when bill-extraction template is missing', async () => {
      prisma.promptTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.getBillExtractionPrompt(
          {
            regionId: 'california',
            sourceUrl:
              'https://leginfo.legislature.ca.gov/faces/billStatusClient.xhtml?bill_id=202520260AB1',
            sessionYear: '2025-2026',
            html: '<html/>',
          },
          'test-key',
          'ca',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPromptHash', () => {
    it('returns SHA-256 hash + version of the active template', async () => {
      const templateText = 'bare template text';
      const expectedHash = createHash('sha256')
        .update(templateText)
        .digest('hex');

      prisma.promptTemplate.findFirst.mockResolvedValue({
        id: '1',
        name: 'structural-analysis',
        templateText,
        version: 3,
        isActive: true,
      });

      const result = await service.getPromptHash('structural-analysis');

      expect(result).toEqual({
        name: 'structural-analysis',
        promptHash: expectedHash,
        promptVersion: 'v3',
      });
    });

    it('throws NotFoundException when template is missing', async () => {
      prisma.promptTemplate.findFirst.mockResolvedValue(null);

      await expect(service.getPromptHash('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ignores inactive templates', async () => {
      prisma.promptTemplate.findFirst.mockResolvedValue(null);

      await expect(service.getPromptHash('inactive')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.promptTemplate.findFirst).toHaveBeenCalledWith({
        where: { name: 'inactive', isActive: true },
      });
    });
  });

  describe('getPromptTemplate (raw template fetch — issue #66)', () => {
    it('returns raw template with variables, hash, version, and expiresAt', async () => {
      const template = {
        id: '1',
        name: 'rag',
        templateText: '{{CONTEXT}} {{QUERY}}',
        version: 3,
        isActive: true,
        variables: ['CONTEXT', 'QUERY'],
      };
      prisma.promptTemplate.findFirst.mockResolvedValue(template);
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getPromptTemplate('rag', 'k', 'ca');

      expect(result.name).toBe('rag');
      expect(result.templateText).toBe('{{CONTEXT}} {{QUERY}}');
      expect(result.variables).toEqual(['CONTEXT', 'QUERY']);
      expect(result.promptVersion).toBe('v3');
      expect(result.promptHash).toBe(
        createHash('sha256').update('{{CONTEXT}} {{QUERY}}').digest('hex'),
      );
      expect(result.expiresAt).toBeDefined();
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(result.experimentId).toBeNull();
      expect(result.variantName).toBeNull();
    });

    it('logs the template-fetch audit entry with the per-template endpoint label', async () => {
      const template = {
        id: '1',
        name: 'rag',
        templateText: 't',
        version: 1,
        isActive: true,
        variables: [],
      };
      prisma.promptTemplate.findFirst.mockResolvedValue(template);
      prisma.promptRequestLog.create.mockResolvedValue({});

      await service.getPromptTemplate('rag', 'my-secret-key', 'tx');

      expect(prisma.promptRequestLog.create).toHaveBeenCalledWith({
        data: {
          endpoint: 'rag:template-fetch',
          promptVersion: 1,
          apiKeyPrefix: 'my-secre...',
          region: 'tx',
          experimentId: null,
          variantName: null,
        },
      });
    });

    it('returns the A/B variant text when an experiment is active', async () => {
      const baseTemplate = {
        id: '1',
        name: 'rag',
        templateText: 'control text',
        version: 1,
        isActive: true,
        variables: ['CONTEXT'],
      };
      experiments.resolveExperiment.mockResolvedValue({
        templateText: 'variant text',
        version: 5,
        templateHash: 'h',
        experimentId: 'exp-1',
        variantName: 'variant_a',
      });
      prisma.promptTemplate.findFirst.mockResolvedValue(baseTemplate);
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getPromptTemplate('rag', 'k', 'ca');

      expect(result.templateText).toBe('variant text');
      expect(result.promptVersion).toBe('v5');
      // Variables come from the base template even when serving a variant —
      // version_history doesn't carry them, but the client needs them to
      // interpolate.
      expect(result.variables).toEqual(['CONTEXT']);
      expect(result.experimentId).toBe('exp-1');
      expect(result.variantName).toBe('variant_a');
    });

    it('returns variant text and empty variables when base template is missing', async () => {
      // Edge case: variant served but the canonical row was hard-deleted
      // (or filter mismatch). Client gets an empty variable list rather
      // than a 500.
      experiments.resolveExperiment.mockResolvedValue({
        templateText: 'variant text',
        version: 2,
        templateHash: 'h',
        experimentId: 'exp-1',
        variantName: 'control',
      });
      prisma.promptTemplate.findFirst.mockResolvedValue(null);
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getPromptTemplate('rag', 'k', 'ca');

      expect(result.templateText).toBe('variant text');
      expect(result.variables).toEqual([]);
    });

    it('throws NotFoundException when template does not exist (no experiment, no row)', async () => {
      experiments.resolveExperiment.mockResolvedValue(null);
      prisma.promptTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.getPromptTemplate('no-such-template', 'k', 'ca'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('verifyPrompt', () => {
    it('should return valid for a matching (hash, version) pair', async () => {
      const templateText = 'test template';
      const expectedHash = createHash('sha256')
        .update(templateText)
        .digest('hex');

      prisma.promptVersionHistory.findFirst.mockResolvedValue({
        id: 'v-1',
        templateText,
        templateHash: expectedHash,
        version: 1,
        template: { name: 'test' },
      });

      const result = await service.verifyPrompt(expectedHash, 'v1');

      expect(result.valid).toBe(true);
      expect(result.templateName).toBe('test');
      expect(prisma.promptVersionHistory.findFirst).toHaveBeenCalledWith({
        where: { templateHash: expectedHash, version: 1 },
        include: { template: { select: { name: true } } },
      });
    });

    it('should return invalid when no version_history entry matches', async () => {
      prisma.promptVersionHistory.findFirst.mockResolvedValue(null);

      const result = await service.verifyPrompt('badhash', 'v1');
      expect(result.valid).toBe(false);
    });

    it('should match HISTORICAL versions, not only currently-active templates (issue #60 behavior shift)', async () => {
      // A v3 hash for a template whose live row is now at v5. The old
      // implementation scanned promptTemplate.findMany — which only sees
      // the current row text — and returned invalid. The new query hits
      // prompt_version_history, which retains every shipped version.
      const historicalText = 'an older revision of the template';
      const historicalHash = createHash('sha256')
        .update(historicalText)
        .digest('hex');

      prisma.promptVersionHistory.findFirst.mockResolvedValue({
        id: 'v-old',
        templateText: historicalText,
        templateHash: historicalHash,
        version: 3,
        template: { name: 'rag' },
      });

      const result = await service.verifyPrompt(historicalHash, 'v3');
      expect(result.valid).toBe(true);
      expect(result.templateName).toBe('rag');
    });

    it('should short-circuit on malformed promptVersion without touching the DB', async () => {
      const result = await service.verifyPrompt('any-hash', 'not-a-version');

      expect(result).toEqual({ valid: false });
      expect(prisma.promptVersionHistory.findFirst).not.toHaveBeenCalled();
    });

    it('should accept bare numeric promptVersion (no leading "v")', async () => {
      prisma.promptVersionHistory.findFirst.mockResolvedValue({
        id: 'v-1',
        templateText: 'foo',
        templateHash: 'h',
        version: 2,
        template: { name: 'rag' },
      });

      await service.verifyPrompt('h', '2');

      expect(prisma.promptVersionHistory.findFirst).toHaveBeenCalledWith({
        where: { templateHash: 'h', version: 2 },
        include: { template: { select: { name: true } } },
      });
    });
  });

  describe('TTL / expiresAt', () => {
    it('should set expiresAt based on PROMPT_TTL_SECONDS config', async () => {
      const customConfig = createMockConfig({ PROMPT_TTL_SECONDS: 7200 });
      const customService = new PromptsService(
        prisma as never,
        customConfig as never,
        experiments as never,
      );

      const template = {
        id: '1',
        name: 'rag',
        templateText: '{{CONTEXT}} {{QUERY}}',
        version: 1,
        isActive: true,
      };

      prisma.promptTemplate.findFirst.mockResolvedValue(template);
      prisma.promptRequestLog.create.mockResolvedValue({});

      const before = Date.now();
      const result = await customService.getRagPrompt(
        { context: 'ctx', query: 'q' },
        'test-key',
        'ca',
      );
      const after = Date.now();

      const expiresMs = new Date(result.expiresAt).getTime();
      // Should expire ~7200 seconds from now
      expect(expiresMs).toBeGreaterThanOrEqual(before + 7200 * 1000);
      expect(expiresMs).toBeLessThanOrEqual(after + 7200 * 1000);
    });

    it('should default to 3600 seconds TTL', async () => {
      const defaultConfig = createMockConfig();
      const defaultService = new PromptsService(
        prisma as never,
        defaultConfig as never,
        experiments as never,
      );

      const template = {
        id: '1',
        name: 'rag',
        templateText: '{{CONTEXT}} {{QUERY}}',
        version: 1,
        isActive: true,
      };

      prisma.promptTemplate.findFirst.mockResolvedValue(template);
      prisma.promptRequestLog.create.mockResolvedValue({});

      const before = Date.now();
      const result = await defaultService.getRagPrompt(
        { context: 'ctx', query: 'q' },
        'test-key',
        'ca',
      );

      const expiresMs = new Date(result.expiresAt).getTime();
      expect(expiresMs).toBeGreaterThanOrEqual(before + 3600 * 1000);
    });
  });

  describe('getBillVotesExtractionPrompt', () => {
    it('returns rendered bill-votes-extraction prompt with all interpolated fields', async () => {
      const template = {
        id: '1',
        name: 'bill-votes-extraction',
        templateText:
          'Region: {{REGION_ID}}\nSource: {{SOURCE_URL}}\nSession: {{SESSION_YEAR}}\nBill: {{BILL_ID}}\nHTML: {{HTML}}',
        version: 1,
        isActive: true,
      };

      prisma.promptTemplate.findFirst.mockResolvedValue(template);
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getBillVotesExtractionPrompt(
        {
          regionId: 'california',
          sourceUrl:
            'https://leginfo.legislature.ca.gov/faces/billVotesClient.xhtml?bill_id=202520260AB1',
          sessionYear: '2025-2026',
          billId: '202520260AB1',
          html: '<html>votes content</html>',
        },
        'test-key',
        'ca',
      );

      expect(result.promptText).toContain('Region: california');
      expect(result.promptText).toContain('Session: 2025-2026');
      expect(result.promptText).toContain('Bill: 202520260AB1');
      expect(result.promptText).toContain('<html>votes content</html>');
      expect(result.promptVersion).toBe('v1');
      expect(result.expiresAt).toBeDefined();
    });

    it('throws NotFoundException when bill-votes-extraction template is missing', async () => {
      prisma.promptTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.getBillVotesExtractionPrompt(
          {
            regionId: 'california',
            sourceUrl:
              'https://leginfo.legislature.ca.gov/faces/billVotesClient.xhtml',
            sessionYear: '2025-2026',
            billId: '202520260AB1',
            html: '<html/>',
          },
          'test-key',
          'ca',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getBillRelevanceExplanationPrompt', () => {
    // The descriptor's buildVariables has 8 optional-field branches —
    // every conditional ternary affects coverage. The "all populated"
    // + "all optional absent" pair covers both legs of each branch.
    const RELEVANCE_TEMPLATE = {
      id: '1',
      name: 'bill-relevance-explanation',
      templateText: [
        'Region: {{REGION_ID}}',
        'Bill: {{BILL_NUMBER}}',
        'Session: {{SESSION_YEAR}}',
        'Title: {{TITLE}}',
        'Bill topics: {{BILL_TOPICS}}',
        'Bill affects: {{BILL_WHO_IT_AFFECTS}}',
        '{{FISCAL_IMPACT_LINE}}{{STAKEHOLDER_IMPACT_LINE}}{{BILL_SECTION_HINT_LINE}}',
        'User-declared interests (topic slugs): {{USER_INTEREST_TAGS}}',
        'User-declared life-context flags (TRUE-only): {{USER_RANKING_FLAGS}}',
        '{{USER_REGION_LINE}}',
        '{{PLAIN_ENGLISH_SUMMARY_BLOCK}}',
      ].join('\n'),
      version: 1,
      isActive: true,
    };

    it('renders the prompt with all optional fields populated', async () => {
      prisma.promptTemplate.findFirst.mockResolvedValue(RELEVANCE_TEMPLATE);
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getBillRelevanceExplanationPrompt(
        {
          regionId: 'california',
          billNumber: 'AB 1',
          sessionYear: '2025-2026',
          title: 'ADU fee cap.',
          plainEnglishSummary: 'Caps ADU fees at $1000.',
          topics: ['housing'],
          whoItAffects: ['homeowners'],
          fiscalImpactLevel: 'low',
          fiscalImpactSummary: 'Negligible state cost.',
          stakeholderImpact: 'Homeowners benefit.',
          billSectionHint: 'Section 12345',
          userInterestTags: ['housing'],
          userRankingFlags: ['isHomeowner'],
          userRegionLabel: '94xxx',
        },
        'test-key',
        'ca',
      );

      expect(result.promptText).toContain('Region: california');
      expect(result.promptText).toContain('Bill: AB 1');
      expect(result.promptText).toContain('Bill topics: housing');
      expect(result.promptText).toContain('Bill affects: homeowners');
      expect(result.promptText).toContain(
        'Fiscal impact: low — Negligible state cost.',
      );
      expect(result.promptText).toContain(
        'Stakeholder impact: Homeowners benefit.',
      );
      expect(result.promptText).toContain(
        'Suggested section to cite: Section 12345',
      );
      expect(result.promptText).toContain(
        'User-declared interests (topic slugs): housing',
      );
      expect(result.promptText).toContain(
        'User-declared life-context flags (TRUE-only): isHomeowner',
      );
      expect(result.promptText).toContain('Approximate region: 94xxx');
      expect(result.promptText).toContain('Caps ADU fees at $1000.');
      expect(result.promptVersion).toBe('v1');
      expect(result.expiresAt).toBeDefined();
    });

    it('renders cleanly with every optional field absent — empty arrays + no fiscal data', async () => {
      prisma.promptTemplate.findFirst.mockResolvedValue(RELEVANCE_TEMPLATE);
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getBillRelevanceExplanationPrompt(
        {
          regionId: 'california',
          billNumber: 'AB 99',
          sessionYear: '2025-2026',
          title: 'Misc.',
          plainEnglishSummary: 'Something.',
          topics: [],
          whoItAffects: [],
          userInterestTags: [],
          userRankingFlags: [],
        },
        'test-key',
        'ca',
      );

      expect(result.promptText).not.toContain('Fiscal impact:');
      expect(result.promptText).not.toContain('Stakeholder impact:');
      expect(result.promptText).not.toContain('Suggested section to cite:');
      expect(result.promptText).not.toContain('Approximate region:');
      expect(result.promptText).toContain('Bill affects: none');
      expect(result.promptText).toContain(
        'User-declared interests (topic slugs): none declared',
      );
      expect(result.promptText).toContain(
        'User-declared life-context flags (TRUE-only): none',
      );
    });

    it('renders fiscal-impact level alone when summary is omitted', async () => {
      prisma.promptTemplate.findFirst.mockResolvedValue(RELEVANCE_TEMPLATE);
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getBillRelevanceExplanationPrompt(
        {
          regionId: 'california',
          billNumber: 'AB 1',
          sessionYear: '2025-2026',
          title: 'X',
          plainEnglishSummary: 'Y.',
          topics: ['housing'],
          whoItAffects: ['renters'],
          fiscalImpactLevel: 'high',
          userInterestTags: ['housing'],
          userRankingFlags: ['isRenter'],
        },
        'test-key',
        'ca',
      );

      expect(result.promptText).toContain('Fiscal impact: high\n');
      expect(result.promptText).not.toContain('Fiscal impact: high —');
    });

    it('throws NotFoundException when bill-relevance-explanation template is missing', async () => {
      prisma.promptTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.getBillRelevanceExplanationPrompt(
          {
            regionId: 'california',
            billNumber: 'AB 1',
            sessionYear: '2025-2026',
            title: 'X',
            plainEnglishSummary: 'Y.',
            topics: [],
            whoItAffects: [],
            userInterestTags: [],
            userRankingFlags: [],
          },
          'test-key',
          'ca',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStructuralAnalysisPrompt — CATEGORY formatting', () => {
    function makeTemplates(baseText: string) {
      const base = {
        id: '1',
        name: 'structural-analysis',
        templateText: baseText,
        version: 1,
        isActive: true,
      };
      const schema = {
        id: '2',
        name: 'structural-schema-default',
        templateText: 'schema',
        version: 1,
        isActive: true,
      };
      return { base, schema };
    }

    it('appends (category: X) when category is provided', async () => {
      const { base, schema } = makeTemplates(
        'extract {{DATA_TYPE}} data{{CATEGORY}}.',
      );
      prisma.promptTemplate.findFirst
        .mockResolvedValueOnce(base)
        .mockResolvedValueOnce(schema);
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getStructuralAnalysisPrompt(
        {
          dataType: 'representatives',
          contentGoal: 'goal',
          category: 'Assembly',
          html: '<div/>',
        },
        'test-key',
        'ca',
      );

      expect(result.promptText).toContain(
        'extract representatives data (category: Assembly).',
      );
    });

    it('omits category suffix when category is undefined', async () => {
      const { base, schema } = makeTemplates(
        'extract {{DATA_TYPE}} data{{CATEGORY}}.',
      );
      prisma.promptTemplate.findFirst
        .mockResolvedValueOnce(base)
        .mockResolvedValueOnce(schema);
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getStructuralAnalysisPrompt(
        { dataType: 'meetings', contentGoal: 'goal', html: '<div/>' },
        'test-key',
        'ca',
      );

      expect(result.promptText).toBe('extract meetings data.');
    });
  });

  describe('runVariableDriftCheck (startup-once)', () => {
    // Issue #60 moved drift detection off the request path. These tests
    // hit the new startup entry point directly. The intentionally-drifted
    // templates in some tests produce warn logs by design.
    function makeTemplate(
      name: string,
      templateText: string,
      variables: string[],
    ) {
      return { name, templateText, version: 1, isActive: true, variables };
    }

    function spyLogger() {
      return {
        warn: jest.spyOn(
          (service as unknown as { logger: { warn: jest.Mock } }).logger,
          'warn',
        ),
        log: jest.spyOn(
          (service as unknown as { logger: { log: jest.Mock } }).logger,
          'log',
        ),
      };
    }

    it('does NOT run drift detection on the request path (hot path is clean)', async () => {
      const warnSpy = jest.spyOn(
        (service as unknown as { logger: { warn: jest.Mock } }).logger,
        'warn',
      );
      // Set up a deliberately-drifted template; if the per-request check
      // had survived the refactor, the rag call below would warn.
      prisma.promptTemplate.findFirst.mockResolvedValue(
        makeTemplate('rag', '{{CONTEXT}} {{ORPHAN}}', ['CONTEXT', 'QUERY']),
      );
      prisma.promptRequestLog.create.mockResolvedValue({});

      await service.getRagPrompt(
        { context: 'ctx', query: 'q' },
        'test-key',
        'ca',
      );

      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('declared but not used'),
      );
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('found in text but not declared'),
      );
    });

    it('logs a clean-pass summary when no drift exists', async () => {
      prisma.promptTemplate.findMany.mockResolvedValue([
        makeTemplate('rag', '{{CONTEXT}} {{QUERY}}', ['CONTEXT', 'QUERY']),
        makeTemplate('other', '{{X}}', ['X']),
      ]);
      const { warn, log } = spyLogger();

      await service.runVariableDriftCheck();

      expect(warn).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(
          'Variable drift check passed for 2 active template(s)',
        ),
      );
    });

    it('warns when a declared variable has no matching placeholder in template text', async () => {
      prisma.promptTemplate.findMany.mockResolvedValue([
        makeTemplate('rag', '{{CONTEXT}}', ['CONTEXT', 'QUERY']),
      ]);
      const { warn } = spyLogger();

      await service.runVariableDriftCheck();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('"QUERY" declared but not used'),
      );
    });

    it('warns when a placeholder in template text is not declared in variables', async () => {
      prisma.promptTemplate.findMany.mockResolvedValue([
        makeTemplate('rag', '{{CONTEXT}} {{QUERY}} {{UNDECLARED}}', [
          'CONTEXT',
          'QUERY',
        ]),
      ]);
      const { warn } = spyLogger();

      await service.runVariableDriftCheck();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          '"{{UNDECLARED}}" found in text but not declared',
        ),
      );
    });

    it('logs an aggregate-warning summary when drift exists', async () => {
      prisma.promptTemplate.findMany.mockResolvedValue([
        makeTemplate('rag', '{{CONTEXT}}', ['CONTEXT', 'QUERY']),
      ]);
      const { warn } = spyLogger();

      await service.runVariableDriftCheck();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Variable drift check found 1 issue(s) across 1 active template(s)',
        ),
      );
    });

    it('does not crash the service on a startup DB hiccup', async () => {
      prisma.promptTemplate.findMany.mockRejectedValue(
        new Error('DB unreachable'),
      );
      const { warn } = spyLogger();

      await expect(service.runVariableDriftCheck()).resolves.not.toThrow();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Variable drift check skipped'),
      );
    });

    it('onModuleInit invokes runVariableDriftCheck', async () => {
      prisma.promptTemplate.findMany.mockResolvedValue([]);
      const spy = jest.spyOn(service, 'runVariableDriftCheck');

      await service.onModuleInit();

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('A/B testing integration', () => {
    it('should serve experiment variant when active experiment exists', async () => {
      experiments.resolveExperiment.mockResolvedValue({
        templateText: 'Experiment version: {{CONTEXT}} {{QUERY}}',
        version: 2,
        templateHash: 'exp-hash',
        experimentId: 'exp-1',
        variantName: 'variant_a',
      });

      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getRagPrompt(
        { context: 'ctx', query: 'q' },
        'test-key',
        'ca',
      );

      expect(result.promptText).toContain('Experiment version: ctx q');
      expect(result.promptVersion).toBe('v2');
    });

    it('should fall back to default when no active experiment', async () => {
      experiments.resolveExperiment.mockResolvedValue(null);

      const template = {
        id: '1',
        name: 'rag',
        templateText: 'Default: {{CONTEXT}} {{QUERY}}',
        version: 1,
        isActive: true,
      };

      prisma.promptTemplate.findFirst.mockResolvedValue(template);
      prisma.promptRequestLog.create.mockResolvedValue({});

      const result = await service.getRagPrompt(
        { context: 'ctx', query: 'q' },
        'test-key',
        'ca',
      );

      expect(result.promptText).toContain('Default: ctx q');
      expect(result.promptVersion).toBe('v1');
    });

    it('should log experimentId and variantName when experiment is active', async () => {
      experiments.resolveExperiment.mockResolvedValue({
        templateText: '{{CONTEXT}} {{QUERY}}',
        version: 2,
        templateHash: 'hash',
        experimentId: 'exp-1',
        variantName: 'control',
      });

      prisma.promptRequestLog.create.mockResolvedValue({});

      await service.getRagPrompt(
        { context: 'ctx', query: 'q' },
        'my-secret-key-123',
        'tx',
      );

      expect(prisma.promptRequestLog.create).toHaveBeenCalledWith({
        data: {
          endpoint: 'rag',
          promptVersion: 2,
          apiKeyPrefix: 'my-secre...',
          region: 'tx',
          experimentId: 'exp-1',
          variantName: 'control',
        },
      });
    });

    it('should log null experiment fields when no experiment is active', async () => {
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
        'tx',
      );

      expect(prisma.promptRequestLog.create).toHaveBeenCalledWith({
        data: {
          endpoint: 'rag',
          promptVersion: 1,
          apiKeyPrefix: 'my-secre...',
          region: 'tx',
          experimentId: null,
          variantName: null,
        },
      });
    });
  });
});
