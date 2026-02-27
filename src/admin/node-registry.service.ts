import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { ListNodesQueryDto } from './dto/list-nodes-query.dto';
import { CertifyNodeDto } from './dto/certify-node.dto';
import { DecertifyNodeDto } from './dto/decertify-node.dto';

@Injectable()
export class NodeRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  private generateApiKey(): string {
    return randomBytes(32).toString('hex');
  }

  async registerNode(dto: CreateNodeDto, adminKeyPrefix: string) {
    const apiKey = this.generateApiKey();

    return this.prisma.$transaction(async (tx) => {
      const node = await tx.node.create({
        data: {
          name: dto.name,
          region: dto.region,
          publicKey: dto.publicKey ?? null,
          apiKey,
          status: 'pending',
        },
      });

      await tx.nodeAuditLog.create({
        data: {
          nodeId: node.id,
          action: 'registered',
          performedBy: adminKeyPrefix,
        },
      });

      return node;
    });
  }

  async listNodes(query: ListNodesQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.region) where.region = query.region;
    if (query.status) where.status = query.status;

    return this.prisma.node.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async getNode(id: string) {
    const node = await this.prisma.node.findUnique({
      where: { id },
      include: {
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!node) throw new NotFoundException(`Node ${id} not found`);
    return node;
  }

  async updateNode(id: string, dto: UpdateNodeDto) {
    const node = await this.prisma.node.findUnique({ where: { id } });
    if (!node) throw new NotFoundException(`Node ${id} not found`);

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.region !== undefined) data.region = dto.region;
    if (dto.publicKey !== undefined) data.publicKey = dto.publicKey;

    return this.prisma.node.update({ where: { id }, data });
  }

  async certifyNode(id: string, dto: CertifyNodeDto, adminKeyPrefix: string) {
    return this.prisma.$transaction(async (tx) => {
      const node = await tx.node.findUnique({ where: { id } });
      if (!node) throw new NotFoundException(`Node ${id} not found`);
      if (node.status === 'decertified') {
        throw new BadRequestException(
          'Cannot certify a decertified node. Use recertify instead.',
        );
      }

      const expiresInDays = dto.expiresInDays ?? 365;
      const certificationExpiresAt = new Date();
      certificationExpiresAt.setDate(
        certificationExpiresAt.getDate() + expiresInDays,
      );

      const updated = await tx.node.update({
        where: { id },
        data: {
          status: 'certified',
          certifiedAt: new Date(),
          certificationExpiresAt,
        },
      });

      await tx.nodeAuditLog.create({
        data: {
          nodeId: id,
          action: 'certified',
          reason: dto.reason,
          performedBy: adminKeyPrefix,
        },
      });

      return updated;
    });
  }

  async decertifyNode(
    id: string,
    dto: DecertifyNodeDto,
    adminKeyPrefix: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const node = await tx.node.findUnique({ where: { id } });
      if (!node) throw new NotFoundException(`Node ${id} not found`);

      const updated = await tx.node.update({
        where: { id },
        data: {
          status: 'decertified',
          decertifiedAt: new Date(),
        },
      });

      await tx.nodeAuditLog.create({
        data: {
          nodeId: id,
          action: 'decertified',
          reason: dto.reason,
          performedBy: adminKeyPrefix,
        },
      });

      return updated;
    });
  }

  async recertifyNode(id: string, dto: CertifyNodeDto, adminKeyPrefix: string) {
    return this.prisma.$transaction(async (tx) => {
      const node = await tx.node.findUnique({ where: { id } });
      if (!node) throw new NotFoundException(`Node ${id} not found`);

      const expiresInDays = dto.expiresInDays ?? 365;
      const certificationExpiresAt = new Date();
      certificationExpiresAt.setDate(
        certificationExpiresAt.getDate() + expiresInDays,
      );

      const updated = await tx.node.update({
        where: { id },
        data: {
          status: 'certified',
          certifiedAt: new Date(),
          certificationExpiresAt,
          decertifiedAt: null,
        },
      });

      await tx.nodeAuditLog.create({
        data: {
          nodeId: id,
          action: 'recertified',
          reason: dto.reason,
          performedBy: adminKeyPrefix,
        },
      });

      return updated;
    });
  }

  async rotateApiKey(id: string, adminKeyPrefix: string) {
    return this.prisma.$transaction(async (tx) => {
      const node = await tx.node.findUnique({ where: { id } });
      if (!node) throw new NotFoundException(`Node ${id} not found`);

      const newApiKey = this.generateApiKey();

      const updated = await tx.node.update({
        where: { id },
        data: { apiKey: newApiKey },
      });

      await tx.nodeAuditLog.create({
        data: {
          nodeId: id,
          action: 'key_rotated',
          performedBy: adminKeyPrefix,
        },
      });

      return updated;
    });
  }

  async deleteNode(id: string) {
    const node = await this.prisma.node.findUnique({ where: { id } });
    if (!node) throw new NotFoundException(`Node ${id} not found`);
    await this.prisma.node.delete({ where: { id } });
    return { deleted: true };
  }

  async getHealthDashboard() {
    const [totalCount, byStatus, expiringIn30Days, recentlyRegistered] =
      await Promise.all([
        this.prisma.node.count(),
        this.prisma.node.groupBy({
          by: ['status'],
          _count: true,
        }),
        this.prisma.node.findMany({
          where: {
            status: 'certified',
            certificationExpiresAt: {
              lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              gt: new Date(),
            },
          },
          select: {
            id: true,
            name: true,
            region: true,
            certificationExpiresAt: true,
          },
          orderBy: { certificationExpiresAt: 'asc' },
        }),
        this.prisma.node.findMany({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
          select: {
            id: true,
            name: true,
            region: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    const statusCounts: Record<string, number> = {};
    for (const entry of byStatus) {
      statusCounts[entry.status] = entry._count;
    }

    return {
      totalNodes: totalCount,
      byStatus: statusCounts,
      expiringIn30Days,
      recentlyRegistered,
    };
  }
}
