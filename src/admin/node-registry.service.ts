import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { VaultService } from '../common/vault.service';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { ListNodesQueryDto } from './dto/list-nodes-query.dto';
import { CertifyNodeDto } from './dto/certify-node.dto';
import { DecertifyNodeDto } from './dto/decertify-node.dto';

@Injectable()
export class NodeRegistryService {
  private readonly logger = new Logger(NodeRegistryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: VaultService,
  ) {}

  private generateApiKey(): string {
    return randomBytes(32).toString('hex');
  }

  private hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  async registerNode(dto: CreateNodeDto, adminKeyPrefix: string) {
    const apiKey = this.generateApiKey();
    const apiKeyHash = this.hashApiKey(apiKey);

    const node = await this.prisma.$transaction(async (tx) => {
      const created = await tx.node.create({
        data: {
          name: dto.name,
          region: dto.region,
          publicKey: dto.publicKey ?? null,
          apiKey,
          apiKeyHash,
          status: 'pending',
        },
      });

      await tx.nodeAuditLog.create({
        data: {
          nodeId: created.id,
          action: 'registered',
          performedBy: adminKeyPrefix,
        },
      });

      return created;
    });

    // Store plaintext key in Vault after transaction commits
    try {
      const secretId = await this.vault.createSecret(
        apiKey,
        `node_key_${node.id}`,
        `API key for node ${node.name}`,
      );
      await this.prisma.node.update({
        where: { id: node.id },
        data: { apiKeySecretId: secretId },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to store API key in Vault for node ${node.id}: ${error}`,
      );
    }

    return node;
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
    const existingNode = await this.prisma.node.findUnique({ where: { id } });
    if (!existingNode) throw new NotFoundException(`Node ${id} not found`);

    const newApiKey = this.generateApiKey();
    const newApiKeyHash = this.hashApiKey(newApiKey);

    const node = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.node.update({
        where: { id },
        data: {
          apiKey: newApiKey,
          apiKeyHash: newApiKeyHash,
        },
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

    // Update Vault: create new secret, delete old one
    try {
      const secretId = await this.vault.createSecret(
        newApiKey,
        `node_key_${id}`,
        `API key for node ${node.name} (rotated)`,
      );
      if (existingNode.apiKeySecretId) {
        await this.vault.deleteSecret(existingNode.apiKeySecretId);
      }
      await this.prisma.node.update({
        where: { id },
        data: { apiKeySecretId: secretId },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to update Vault for key rotation on node ${id}: ${error}`,
      );
    }

    return node;
  }

  async deleteNode(id: string) {
    const node = await this.prisma.node.findUnique({ where: { id } });
    if (!node) throw new NotFoundException(`Node ${id} not found`);

    await this.prisma.node.delete({ where: { id } });

    // Clean up Vault secret
    if (node.apiKeySecretId) {
      try {
        await this.vault.deleteSecret(node.apiKeySecretId);
      } catch (error) {
        this.logger.warn(
          `Failed to delete Vault secret for node ${id}: ${error}`,
        );
      }
    }

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
