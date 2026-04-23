import { Controller, Get, HttpStatus, Logger, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../common/prisma.service';
import { PromptsService } from '../prompts/prompts.service';

/**
 * Health check for container orchestrators + monitoring.
 *
 * Returns 200 with status=ok when the database is reachable and the
 * template store is queryable. Returns 503 with status=error when the
 * database is unreachable so orchestrators can pull unhealthy instances
 * out of rotation and alerting surfaces the outage. See issue #25.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly prompts: PromptsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, description: 'Healthy' })
  @ApiResponse({ status: 503, description: 'Unhealthy — database unreachable' })
  async check(@Res({ passthrough: true }) res: Response) {
    let dbHealthy = false;
    let dbErrorDetail: string | undefined;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbHealthy = true;
    } catch (error) {
      // Capture the error class/short message but NOT the full stack or
      // any connection string that Prisma might include in the detail.
      const raw = (error as Error).message ?? 'unknown database error';
      dbErrorDetail = raw.split('\n')[0].slice(0, 120);
      this.logger.error(`Health probe failed: database unreachable`);
    }

    const templateCount = dbHealthy
      ? await this.prisma.promptTemplate.count({ where: { isActive: true } })
      : 0;

    // Exposed for ops visibility into dropped audit logs (see #25).
    // Doesn't affect the health status itself — audit failures are
    // non-fatal — but ops can alert on trend.
    const auditLogFailures = this.prompts.getAuditLogFailureCount();

    if (!dbHealthy) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        detail: dbErrorDetail,
        auditLogFailures,
      };
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      activeTemplates: templateCount,
      auditLogFailures,
    };
  }
}
