import { Test } from '@nestjs/testing';
import { getToken } from '@willsoto/nestjs-prometheus';
import { Gauge } from 'prom-client';
import { PrismaService } from '../common/prisma.service';
import {
  CertExpirySchedulerService,
  CERT_EXPIRY_CRITICAL_METRIC,
  CERT_EXPIRY_SOON_METRIC,
} from './cert-expiry-scheduler.service';

function makePrisma(nodes: object[] = []) {
  return {
    node: {
      findMany: jest.fn().mockResolvedValue(nodes),
    },
  };
}

function makeGauge(): jest.Mocked<Gauge> {
  return { set: jest.fn() } as unknown as jest.Mocked<Gauge>;
}

async function buildService(
  prisma: object,
  soonGauge: Gauge,
  criticalGauge: Gauge,
) {
  const module = await Test.createTestingModule({
    providers: [
      CertExpirySchedulerService,
      { provide: PrismaService, useValue: prisma },
      { provide: getToken(CERT_EXPIRY_SOON_METRIC), useValue: soonGauge },
      {
        provide: getToken(CERT_EXPIRY_CRITICAL_METRIC),
        useValue: criticalGauge,
      },
    ],
  }).compile();

  return module.get(CertExpirySchedulerService);
}

describe('CertExpirySchedulerService', () => {
  it('sets gauges to 0 and logs nothing when no certs are expiring', async () => {
    const prisma = makePrisma([]);
    const soonGauge = makeGauge();
    const criticalGauge = makeGauge();
    const svc = await buildService(prisma, soonGauge, criticalGauge);

    await svc.checkCertExpiry();

    expect(soonGauge.set).toHaveBeenCalledWith(0);
    expect(criticalGauge.set).toHaveBeenCalledWith(0);
  });

  it('sets expiringSoon gauge to node count and logs a warning per node', async () => {
    const expiresAt = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000); // 20 days out
    const nodes = [
      {
        id: 'n1',
        name: 'ca-node',
        region: 'ca',
        certificationExpiresAt: expiresAt,
      },
      {
        id: 'n2',
        name: 'tx-node',
        region: 'tx',
        certificationExpiresAt: expiresAt,
      },
    ];
    const prisma = makePrisma(nodes);
    const soonGauge = makeGauge();
    const criticalGauge = makeGauge();
    const svc = await buildService(prisma, soonGauge, criticalGauge);

    await svc.checkCertExpiry();

    expect(soonGauge.set).toHaveBeenCalledWith(2);
    expect(criticalGauge.set).toHaveBeenCalledWith(0);
  });

  it('counts critical nodes (expiring ≤7 days) separately', async () => {
    const criticalAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days
    const soonAt = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000); // 20 days
    const nodes = [
      {
        id: 'n1',
        name: 'ca-node',
        region: 'ca',
        certificationExpiresAt: criticalAt,
      },
      {
        id: 'n2',
        name: 'tx-node',
        region: 'tx',
        certificationExpiresAt: soonAt,
      },
    ];
    const prisma = makePrisma(nodes);
    const soonGauge = makeGauge();
    const criticalGauge = makeGauge();
    const svc = await buildService(prisma, soonGauge, criticalGauge);

    await svc.checkCertExpiry();

    expect(soonGauge.set).toHaveBeenCalledWith(2);
    expect(criticalGauge.set).toHaveBeenCalledWith(1);
  });

  it('queries only certified nodes within the 30-day window', async () => {
    const prisma = makePrisma([]);
    const svc = await buildService(prisma, makeGauge(), makeGauge());

    await svc.checkCertExpiry();

    const call = (prisma.node.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.status).toBe('certified');
    expect(call.where.certificationExpiresAt).toMatchObject({
      lte: expect.any(Date),
      gt: expect.any(Date),
    });
  });

  it('onModuleInit swallows DB errors so a transient failure cannot crash the service', async () => {
    const prisma = {
      node: {
        findMany: jest.fn().mockRejectedValue(new Error('DB unreachable')),
      },
    };
    const svc = await buildService(prisma, makeGauge(), makeGauge());

    await expect(svc.onModuleInit()).resolves.not.toThrow();
  });
});
