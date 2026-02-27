import { ExperimentsService } from './experiments.service';

function createMockPrisma() {
  return {
    promptTemplate: {
      findFirst: jest.fn(),
    },
    experiment: {
      findFirst: jest.fn(),
    },
  };
}

describe('ExperimentsService', () => {
  let service: ExperimentsService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ExperimentsService(prisma as never);
  });

  describe('resolveExperiment', () => {
    it('should return null when template not found', async () => {
      prisma.promptTemplate.findFirst.mockResolvedValue(null);

      const result = await service.resolveExperiment('unknown', 'key-1');

      expect(result).toBeNull();
    });

    it('should return null when no active experiment', async () => {
      prisma.promptTemplate.findFirst.mockResolvedValue({
        id: 't1',
        name: 'rag',
      });
      prisma.experiment.findFirst.mockResolvedValue(null);

      const result = await service.resolveExperiment('rag', 'key-1');

      expect(result).toBeNull();
    });

    it('should return correct variant for bucketed API key', async () => {
      prisma.promptTemplate.findFirst.mockResolvedValue({
        id: 't1',
        name: 'rag',
      });
      prisma.experiment.findFirst.mockResolvedValue({
        id: 'exp-1',
        status: 'active',
        variants: [
          {
            name: 'control',
            trafficPct: 50,
            versionEntry: {
              templateText: 'control text',
              version: 1,
              templateHash: 'hash-1',
            },
          },
          {
            name: 'variant_a',
            trafficPct: 50,
            versionEntry: {
              templateText: 'variant text',
              version: 2,
              templateHash: 'hash-2',
            },
          },
        ],
      });

      const result = await service.resolveExperiment('rag', 'key-1');

      expect(result).not.toBeNull();
      expect(result!.experimentId).toBe('exp-1');
      expect(['control', 'variant_a']).toContain(result!.variantName);
    });
  });

  describe('computeBucket', () => {
    it('should be deterministic (same input = same output)', () => {
      const bucket1 = service.computeBucket('key-1', 'exp-1');
      const bucket2 = service.computeBucket('key-1', 'exp-1');

      expect(bucket1).toBe(bucket2);
    });

    it('should produce different results for different API keys', () => {
      const buckets = new Set<number>();
      for (let i = 0; i < 50; i++) {
        buckets.add(service.computeBucket(`key-${i}`, 'exp-1'));
      }

      // With 50 keys, we expect multiple distinct buckets
      expect(buckets.size).toBeGreaterThan(5);
    });

    it('should produce values in range 0-99', () => {
      for (let i = 0; i < 100; i++) {
        const bucket = service.computeBucket(`key-${i}`, `exp-${i}`);
        expect(bucket).toBeGreaterThanOrEqual(0);
        expect(bucket).toBeLessThan(100);
      }
    });

    it('should produce different buckets for different experiments', () => {
      // Use multiple keys to make the test robust against individual collisions
      let differentCount = 0;
      for (let i = 0; i < 20; i++) {
        const a = service.computeBucket(`key-${i}`, 'exp-a');
        const b = service.computeBucket(`key-${i}`, 'exp-b');
        if (a !== b) differentCount++;
      }
      expect(differentCount).toBeGreaterThan(10);
    });
  });

  describe('variant selection', () => {
    it('should correctly select variants with 50/50 split', async () => {
      const template = { id: 't1', name: 'rag' };
      prisma.promptTemplate.findFirst.mockResolvedValue(template);

      const variants = [
        {
          name: 'control',
          trafficPct: 50,
          versionEntry: {
            templateText: 'control',
            version: 1,
            templateHash: 'h1',
          },
        },
        {
          name: 'variant_a',
          trafficPct: 50,
          versionEntry: {
            templateText: 'variant',
            version: 2,
            templateHash: 'h2',
          },
        },
      ];

      prisma.experiment.findFirst.mockResolvedValue({
        id: 'exp-1',
        status: 'active',
        variants,
      });

      // Test with many keys and verify both variants are served
      const served = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const result = await service.resolveExperiment('rag', `key-${i}`);
        if (result) served.add(result.variantName);
      }

      expect(served.has('control')).toBe(true);
      expect(served.has('variant_a')).toBe(true);
    });

    it('should correctly select variants with 90/10 split', async () => {
      const template = { id: 't1', name: 'rag' };
      prisma.promptTemplate.findFirst.mockResolvedValue(template);

      const variants = [
        {
          name: 'control',
          trafficPct: 90,
          versionEntry: {
            templateText: 'control',
            version: 1,
            templateHash: 'h1',
          },
        },
        {
          name: 'variant_a',
          trafficPct: 10,
          versionEntry: {
            templateText: 'variant',
            version: 2,
            templateHash: 'h2',
          },
        },
      ];

      prisma.experiment.findFirst.mockResolvedValue({
        id: 'exp-1',
        status: 'active',
        variants,
      });

      let controlCount = 0;
      let variantCount = 0;
      for (let i = 0; i < 200; i++) {
        const result = await service.resolveExperiment('rag', `key-${i}`);
        if (result?.variantName === 'control') controlCount++;
        if (result?.variantName === 'variant_a') variantCount++;
      }

      // Control should get ~90% of traffic
      expect(controlCount).toBeGreaterThan(variantCount);
      expect(variantCount).toBeGreaterThan(0);
    });
  });
});
