import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VaultService } from '../common/vault.service';

@Injectable()
export class AdminKeyGuard implements CanActivate, OnModuleInit {
  private readonly logger = new Logger(AdminKeyGuard.name);
  private readonly validKeys: Set<string>;

  constructor(
    private readonly config: ConfigService,
    private readonly vault: VaultService,
  ) {
    // Initialize from env var as fallback (always available)
    const keys = this.config.get<string>('ADMIN_API_KEYS', '');
    this.validKeys = new Set(
      keys
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
    );
  }

  async onModuleInit() {
    try {
      const secrets = await this.vault.getSecretsByPrefix('admin_key_');
      for (const { secret } of secrets) {
        this.validKeys.add(secret);
      }
      if (secrets.length > 0) {
        this.logger.log(`Loaded ${secrets.length} admin key(s) from Vault`);
      }
    } catch {
      this.logger.warn(
        'Could not load admin keys from Vault, using env var fallback',
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const token = authHeader.slice(7);
    if (!this.validKeys.has(token)) {
      throw new UnauthorizedException('Invalid admin API key');
    }

    request.adminKey = token;
    return true;
  }
}
