import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: { $queryRaw: jest.Mock; promptTemplate: { count: jest.Mock } };

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      promptTemplate: { count: jest.fn() },
    };
    controller = new HealthController(prisma as never);
  });

  it('should return ok when database is connected', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    prisma.promptTemplate.count.mockResolvedValue(13);

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.database).toBe('connected');
    expect(result.activeTemplates).toBe(13);
    expect(result.timestamp).toBeDefined();
  });

  it('should return degraded when database is down', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));

    const result = await controller.check();

    expect(result.status).toBe('degraded');
    expect(result.database).toBe('disconnected');
    expect(result.activeTemplates).toBe(0);
  });
});
