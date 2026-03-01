import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

interface VaultSecret {
  id: string;
  name: string;
  secret: string;
}

@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createSecret(
    value: string,
    name: string,
    description?: string,
  ): Promise<string> {
    const result = await this.prisma.$queryRaw<[{ id: string }]>`
      SELECT vault.create_secret(${value}, ${name}, ${description ?? ''}) AS id
    `;
    this.logger.debug(`Created vault secret: ${name}`);
    return result[0].id;
  }

  async getSecret(secretId: string): Promise<string | null> {
    const result = await this.prisma.$queryRaw<VaultSecret[]>`
      SELECT id::text, name, decrypted_secret AS secret
      FROM vault.decrypted_secrets
      WHERE id = ${secretId}::uuid
    `;
    return result[0]?.secret ?? null;
  }

  async getSecretByName(name: string): Promise<string | null> {
    const result = await this.prisma.$queryRaw<VaultSecret[]>`
      SELECT id::text, name, decrypted_secret AS secret
      FROM vault.decrypted_secrets
      WHERE name = ${name}
    `;
    return result[0]?.secret ?? null;
  }

  async getSecretsByPrefix(
    prefix: string,
  ): Promise<{ name: string; secret: string }[]> {
    const pattern = `${prefix}%`;
    const result = await this.prisma.$queryRaw<VaultSecret[]>`
      SELECT id::text, name, decrypted_secret AS secret
      FROM vault.decrypted_secrets
      WHERE name LIKE ${pattern}
    `;
    return result.map((r) => ({ name: r.name, secret: r.secret }));
  }

  async updateSecret(secretId: string, newValue: string): Promise<void> {
    await this.prisma.$queryRaw`
      UPDATE vault.secrets
      SET secret = ${newValue}
      WHERE id = ${secretId}::uuid
    `;
    this.logger.debug(`Updated vault secret: ${secretId}`);
  }

  async deleteSecret(secretId: string): Promise<void> {
    await this.prisma.$queryRaw`
      DELETE FROM vault.secrets
      WHERE id = ${secretId}::uuid
    `;
    this.logger.debug(`Deleted vault secret: ${secretId}`);
  }
}
