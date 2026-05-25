import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { VaultService } from '../common/vault.service';
import { safeCompare } from '../common/crypto.utils';

@Injectable()
export class ApiKeyGuard implements CanActivate, OnModuleInit {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private readonly keyToRegion: Map<string, string>;
  private readonly hmacToleranceSeconds: number;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly vault: VaultService,
  ) {
    this.hmacToleranceSeconds = parseInt(
      this.config.get('HMAC_TIMESTAMP_TOLERANCE_SECONDS', '300'),
      10,
    );

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

  private computeHmacSignature(
    apiKey: string,
    timestamp: string,
    method: string,
    path: string,
    bodyHash: string,
  ): string {
    const signatureString = `${timestamp}\n${method}\n${path}\n${bodyHash}`;
    return createHmac('sha256', apiKey)
      .update(signatureString)
      .digest('base64');
  }

  /**
   * Verify the HMAC signature against the canonical path form, falling
   * back to the legacy form during the transitional release (issue #61).
   * Throws UnauthorizedException when neither matches; emits the
   * `hmac_legacy_path_signature` warn event when only the legacy form
   * matches, so ops can monitor when to ship the follow-up tightening PR.
   */
  private verifyHmacSignature(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request: any,
    apiKey: string,
    signature: string,
    timestamp: string,
    keyId: string,
  ): void {
    const rawBody = request.rawBody
      ? Buffer.from(request.rawBody).toString('utf8')
      : '';
    const bodyHash = createHash('sha256').update(rawBody).digest('hex');
    const method = request.method.toUpperCase();
    const canonicalPath = request.originalUrl || request.url;
    const legacyPath = request.path || request.url;

    const canonicalSig = this.computeHmacSignature(
      apiKey,
      timestamp,
      method,
      canonicalPath,
      bodyHash,
    );
    if (safeCompare(canonicalSig, signature)) return;

    // Only compute the legacy candidate when the canonical form failed and
    // the two forms actually differ — skips the work on the happy path.
    if (canonicalPath !== legacyPath) {
      const legacySig = this.computeHmacSignature(
        apiKey,
        timestamp,
        method,
        legacyPath,
        bodyHash,
      );
      if (safeCompare(legacySig, signature)) {
        this.logger.warn({
          event: 'hmac_legacy_path_signature',
          keyId,
          canonicalPath,
          legacyPath,
        });
        return;
      }
    }

    this.logger.warn({
      event: 'auth_failed',
      method: 'hmac',
      reason: 'signature_mismatch',
      keyId,
    });
    throw new UnauthorizedException('Invalid HMAC signature');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // HMAC path: check for HMAC signature headers first
    const hmacSignature = request.headers['x-hmac-signature'] as
      | string
      | undefined;
    if (hmacSignature) {
      return this.validateHmac(request);
    }

    // Bearer path: existing token-based auth
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

    this.logger.warn({
      event: 'auth_failed',
      method: 'bearer',
      reason: 'invalid_or_expired_key',
    });
    throw new UnauthorizedException('Invalid API key');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async validateHmac(request: any): Promise<boolean> {
    const signature = request.headers['x-hmac-signature'] as string;
    const timestamp = request.headers['x-hmac-timestamp'] as string;
    const keyId = request.headers['x-hmac-key-id'] as string;

    if (!signature || !timestamp || !keyId) {
      throw new UnauthorizedException('Missing HMAC headers');
    }

    // Validate timestamp (replay protection)
    const requestTime = Number.parseInt(timestamp, 10);
    if (Number.isNaN(requestTime)) {
      throw new UnauthorizedException('Invalid HMAC timestamp');
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - requestTime) > this.hmacToleranceSeconds) {
      throw new UnauthorizedException('HMAC timestamp expired');
    }

    // Look up the node
    const node = await this.prisma.node.findUnique({ where: { id: keyId } });
    if (!node) {
      throw new UnauthorizedException('Unknown node');
    }

    if (
      node.status !== 'certified' ||
      !node.certificationExpiresAt ||
      node.certificationExpiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Node is not certified');
    }

    // Retrieve the API key from Vault
    if (!node.apiKeySecretId) {
      throw new UnauthorizedException('Node has no HMAC key configured');
    }

    let apiKey: string;
    try {
      const secret = await this.vault.getSecret(node.apiKeySecretId);
      if (!secret) {
        throw new Error('Secret not found');
      }
      apiKey = secret;
    } catch {
      throw new UnauthorizedException('Failed to retrieve node key');
    }

    this.verifyHmacSignature(request, apiKey, signature, timestamp, keyId);

    // Propagate the authenticated secret so downstream audit logging
    // (apiKeyPrefix) can record which key served the request, matching
    // the Bearer path's behavior. Without this, audit-log writes throw
    // on `undefined.slice` for HMAC-signed requests.
    request.apiKey = apiKey;
    request.region = node.region;
    request.nodeId = node.id;
    return true;
  }
}
