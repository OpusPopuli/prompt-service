import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from './prisma.service';

interface VaultSecret {
  id: string;
  name: string;
  secret: string;
}

@Injectable()
export class VaultService implements OnApplicationBootstrap {
  private readonly logger = new Logger(VaultService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verify Vault connectivity at startup. In production, failure aborts
   * the app boot — the orchestrator will restart/alert. In dev, we log
   * a warning and continue so local development doesn't require a
   * fully-configured Supabase Vault.
   *
   * This prevents silently falling back to env-var keys when Vault is
   * unreachable, which would bypass the key-rotation mechanism. See #24.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      // Lightweight probe: SELECT a known vault schema object. If Vault
      // is unreachable, Prisma raises before returning any rows.
      await this.prisma
        .$queryRaw`SELECT 1 FROM vault.decrypted_secrets LIMIT 1`;
      this.logger.log('Vault connectivity verified');
    } catch (error) {
      const message = `Vault is not reachable at startup: ${(error as Error).message}`;
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(
          `${message}. Aborting boot — refusing to run with stale env-var-fallback keys in production.`,
        );
        throw error;
      }
      this.logger.warn(
        `${message}. Continuing in ${process.env.NODE_ENV ?? 'dev'} mode with env-var fallback; would ABORT in production.`,
      );
    }
  }

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

  /**
   * Escape SQL LIKE wildcards in user-controlled input so the caller's
   * prefix is treated literally. Without this, a prefix containing `%`
   * or `_` would silently broaden the match — an enumeration vector if
   * the prefix ever comes from outside the trusted code path.
   *
   * Pairs with the `ESCAPE '\\'` clause in the query below.
   * See issue #24.
   */
  private escapeLikePattern(input: string): string {
    return input
      .replaceAll('\\', String.raw`\\`)
      .replaceAll('%', String.raw`\%`)
      .replaceAll('_', String.raw`\_`);
  }

  async getSecretsByPrefix(
    prefix: string,
  ): Promise<{ name: string; secret: string }[]> {
    const pattern = `${this.escapeLikePattern(prefix)}%`;
    const result = await this.prisma.$queryRaw<VaultSecret[]>`
      SELECT id::text, name, decrypted_secret AS secret
      FROM vault.decrypted_secrets
      WHERE name LIKE ${pattern} ESCAPE '\'
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
