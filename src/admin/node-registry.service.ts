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

  private certificationExpiresAt(dto: CertifyNodeDto): Date {
    const expiresInDays = dto.expiresInDays ?? 365;
    const date = new Date();
    date.setDate(date.getDate() + expiresInDays);
    return date;
  }

  private async findNodeOrThrow(
    client: Pick<PrismaService, 'node'>,
    id: string,
  ) {
    const node = await client.node.findUnique({ where: { id } });
    if (!node) throw new NotFoundException(`Node ${id} not found`);
    return node;
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
    let apiKeySecretId: string | null = null;
    try {
      apiKeySecretId = await this.vault.createSecret(
        apiKey,
        `node_key_${node.id}`,
        `API key for node ${node.name}`,
      );
      await this.prisma.node.update({
        where: { id: node.id },
        data: { apiKeySecretId },
      });
    } catch (error) {
      this.logger.warn({
        event: 'vault_write_failed',
        action: 'store_api_key',
        nodeId: node.id,
        error: (error as Error).message,
      });
    }

    this.logger.log({
      event: 'node_registered',
      nodeId: node.id,
      region: node.region,
      performedBy: adminKeyPrefix,
    });

    // Return the plaintext key in the response body so the admin caller can
    // hand it to the node operator. It is NEVER persisted to the nodes row —
    // the only canonical copies are the hash (for Bearer lookup) and the
    // Vault secret (for HMAC verification). See issue #59.
    return { ...node, apiKey, apiKeySecretId };
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
    await this.findNodeOrThrow(this.prisma, id);

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.region !== undefined) data.region = dto.region;
    if (dto.publicKey !== undefined) data.publicKey = dto.publicKey;

    return this.prisma.node.update({ where: { id }, data });
  }

  async certifyNode(id: string, dto: CertifyNodeDto, adminKeyPrefix: string) {
    return this.prisma.$transaction(async (tx) => {
      const node = await this.findNodeOrThrow(tx, id);
      if (node.status === 'decertified') {
        throw new BadRequestException(
          'Cannot certify a decertified node. Use recertify instead.',
        );
      }

      const updated = await tx.node.update({
        where: { id },
        data: {
          status: 'certified',
          certifiedAt: new Date(),
          certificationExpiresAt: this.certificationExpiresAt(dto),
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

      this.logger.log({
        event: 'node_certified',
        nodeId: id,
        performedBy: adminKeyPrefix,
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
      await this.findNodeOrThrow(tx, id);

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

      this.logger.log({
        event: 'node_decertified',
        nodeId: id,
        performedBy: adminKeyPrefix,
      });
      return updated;
    });
  }

  async recertifyNode(id: string, dto: CertifyNodeDto, adminKeyPrefix: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.findNodeOrThrow(tx, id);

      const updated = await tx.node.update({
        where: { id },
        data: {
          status: 'certified',
          certifiedAt: new Date(),
          certificationExpiresAt: this.certificationExpiresAt(dto),
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

      this.logger.log({
        event: 'node_recertified',
        nodeId: id,
        performedBy: adminKeyPrefix,
      });
      return updated;
    });
  }

  async rotateApiKey(id: string, adminKeyPrefix: string) {
    const existingNode = await this.findNodeOrThrow(this.prisma, id);

    const newApiKey = this.generateApiKey();
    const newApiKeyHash = this.hashApiKey(newApiKey);

    // Vault write FIRST. If this fails, no DB state changes — the node keeps
    // its old key and remains authenticatable. This is the atomicity fix from
    // issue #59 (previously: DB updated, then Vault write — if Vault failed,
    // HMAC auth silently broke because apiKeySecretId pointed at the stale
    // entry while apiKeyHash had already rotated).
    //
    // The name includes a timestamp suffix so consecutive rotations don't
    // collide with the still-extant previous entry (Vault enforces name
    // uniqueness). The DB only ever stores the returned secret ID.
    const newSecretId = await this.vault.createSecret(
      newApiKey,
      `node_key_${id}_${Date.now()}`,
      `API key for node ${existingNode.name} (rotated)`,
    );

    // Now flip hash + secretId + audit log in a single DB transaction. Either
    // the whole rotation lands or none of it does.
    const node = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.node.update({
        where: { id },
        data: {
          apiKeyHash: newApiKeyHash,
          apiKeySecretId: newSecretId,
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

    // Best-effort cleanup of the previous Vault secret. A failure here leaves
    // an orphaned Vault entry but does NOT break the node — it has already
    // been rotated to the new secret in both DB columns.
    if (existingNode.apiKeySecretId) {
      try {
        await this.vault.deleteSecret(existingNode.apiKeySecretId);
      } catch (error) {
        this.logger.warn({
          event: 'vault_delete_failed',
          action: 'rotate_api_key_cleanup',
          nodeId: id,
          staleSecretId: existingNode.apiKeySecretId,
          error: (error as Error).message,
        });
      }
    }

    this.logger.log({
      event: 'node_key_rotated',
      nodeId: id,
      performedBy: adminKeyPrefix,
    });

    // Return the new plaintext key so the admin caller can hand it to the
    // node operator. Never persisted to the row — see registerNode comment.
    return { ...node, apiKey: newApiKey };
  }

  async deleteNode(id: string) {
    const node = await this.findNodeOrThrow(this.prisma, id);

    await this.prisma.node.delete({ where: { id } });

    // Clean up Vault secret
    if (node.apiKeySecretId) {
      try {
        await this.vault.deleteSecret(node.apiKeySecretId);
      } catch (error) {
        this.logger.warn({
          event: 'vault_write_failed',
          action: 'delete_secret',
          nodeId: id,
          error: (error as Error).message,
        });
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
