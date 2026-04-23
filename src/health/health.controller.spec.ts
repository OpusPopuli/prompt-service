import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: { $queryRaw: jest.Mock; promptTemplate: { count: jest.Mock } };
  let prompts: { getAuditLogFailureCount: jest.Mock };
  let res: { status: jest.Mock };

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      promptTemplate: { count: jest.fn() },
    };
    prompts = { getAuditLogFailureCount: jest.fn().mockReturnValue(0) };
    res = { status: jest.fn() };
    controller = new HealthController(prisma as never, prompts as never);
  });

  it('should return ok when database is connected', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    prisma.promptTemplate.count.mockResolvedValue(13);

    const result = await controller.check(res as unknown as Response);

    expect(result.status).toBe('ok');
    expect(result.database).toBe('connected');
    expect(result.activeTemplates).toBe(13);
    expect(result.auditLogFailures).toBe(0);
    expect(result.timestamp).toBeDefined();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 503 with error status when database is down', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    prompts.getAuditLogFailureCount.mockReturnValue(2);

    const result = await controller.check(res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(result.status).toBe('error');
    expect(result.database).toBe('disconnected');
    expect(result.auditLogFailures).toBe(2);
    expect(result.detail).toContain('connection refused');
    expect(prisma.promptTemplate.count).not.toHaveBeenCalled();
  });

  it('should expose audit log failure count on healthy response', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    prisma.promptTemplate.count.mockResolvedValue(5);
    prompts.getAuditLogFailureCount.mockReturnValue(7);

    const result = await controller.check(res as unknown as Response);

    expect(result.status).toBe('ok');
    expect(result.auditLogFailures).toBe(7);
  });

  it('should redact multi-line db error detail and cap at 120 chars', async () => {
    const huge = 'line1: ' + 'X'.repeat(200) + '\nline2: secret-conn-string';
    prisma.$queryRaw.mockRejectedValue(new Error(huge));

    const result = await controller.check(res as unknown as Response);

    expect(result.detail).toBeDefined();
    expect(result.detail!.length).toBeLessThanOrEqual(120);
    expect(result.detail).not.toContain('secret-conn-string');
  });
});
