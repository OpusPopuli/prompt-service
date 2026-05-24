import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Gauge } from 'prom-client';
import { PrismaService } from '../common/prisma.service';

export const CERT_EXPIRY_SOON_METRIC = 'node_certs_expiring_soon';
export const CERT_EXPIRY_CRITICAL_METRIC = 'node_certs_expiring_critical';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class CertExpirySchedulerService implements OnModuleInit {
  private readonly logger = new Logger(CertExpirySchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectMetric(CERT_EXPIRY_SOON_METRIC)
    private readonly expiringSoonGauge: Gauge,
    @InjectMetric(CERT_EXPIRY_CRITICAL_METRIC)
    private readonly expiringCriticalGauge: Gauge,
  ) {}

  async onModuleInit() {
    // Populate gauges at startup so Prometheus has initial values before the
    // first hourly cron tick. Errors are swallowed — a transient DB hiccup at
    // boot must not crash the service; the cron will retry on the next tick.
    try {
      await this.checkCertExpiry();
    } catch {
      this.logger.warn(
        'Could not run cert expiry check on startup, will retry on next cron tick',
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async checkCertExpiry() {
    const now = new Date();
    const in30Days = new Date(now.getTime() + THIRTY_DAYS_MS);
    const in7Days = new Date(now.getTime() + SEVEN_DAYS_MS);

    const expiringNodes = await this.prisma.node.findMany({
      where: {
        status: 'certified',
        certificationExpiresAt: { lte: in30Days, gt: now },
      },
      select: {
        id: true,
        name: true,
        region: true,
        certificationExpiresAt: true,
      },
      orderBy: { certificationExpiresAt: 'asc' },
    });

    const criticalCount = expiringNodes.filter(
      (n) => n.certificationExpiresAt! <= in7Days,
    ).length;

    this.expiringSoonGauge.set(expiringNodes.length);
    this.expiringCriticalGauge.set(criticalCount);

    for (const node of expiringNodes) {
      const msRemaining =
        node.certificationExpiresAt!.getTime() - now.getTime();
      const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

      this.logger.warn({
        event: 'cert_expiry_warning',
        nodeId: node.id,
        name: node.name,
        region: node.region,
        daysRemaining,
      });
    }
  }
}
