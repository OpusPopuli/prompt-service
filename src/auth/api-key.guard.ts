import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { VaultService } from '../common/vault.service';

@Injectable()
export class ApiKeyGuard implements CanActivate, OnModuleInit {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private readonly keyToRegion: Map<string, string>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly vault: VaultService,
  ) {
    // Initialize from env var as fallback (always available)
    const keys = this.config.get<string>('API_KEYS', '');
    this.keyToRegion = new Map(
      keys
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const colonIdx = entry.indexOf(':');
          if (colonIdx === -1) return [entry, 'unknown'] as [string, string];
          return [entry.slice(colonIdx + 1), entry.slice(0, colonIdx)] as [
            string,
            string,
          ];
        }),
    );
  }

  async onModuleInit() {
    try {
      const secrets = await this.vault.getSecretsByPrefix('region_key_');
      for (const { name, secret } of secrets) {
        const region = name.replace('region_key_', '');
        this.keyToRegion.set(secret, region);
      }
      if (secrets.length > 0) {
        this.logger.log(`Loaded ${secrets.length} region key(s) from Vault`);
      }
    } catch {
      this.logger.warn(
        'Could not load region keys from Vault, using env var fallback',
      );
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const token = authHeader.slice(7);

    // Fast path: check env var / Vault-loaded region keys
    const envRegion = this.keyToRegion.get(token);
    if (envRegion !== undefined) {
      request.apiKey = token;
      request.region = envRegion;
      return true;
    }

    // Slow path: hash token and check DB node keys
    const tokenHash = this.hashToken(token);
    const node = await this.prisma.node.findFirst({
      where: {
        apiKeyHash: tokenHash,
        status: 'certified',
        certificationExpiresAt: { gt: new Date() },
      },
    });

    if (node) {
      request.apiKey = token;
      request.region = node.region;
      request.nodeId = node.id;
      return true;
    }

    throw new UnauthorizedException('Invalid API key');
  }
}
