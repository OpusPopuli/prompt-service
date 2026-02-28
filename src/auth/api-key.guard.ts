import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly keyToRegion: Map<string, string>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
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

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const token = authHeader.slice(7);

    // Fast path: check env var keys first
    const envRegion = this.keyToRegion.get(token);
    if (envRegion !== undefined) {
      request.apiKey = token;
      request.region = envRegion;
      return true;
    }

    // Slow path: check DB node keys
    const node = await this.prisma.node.findFirst({
      where: {
        apiKey: token,
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
