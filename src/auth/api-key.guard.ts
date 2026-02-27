import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly keyToRegion: Map<string, string>;

  constructor(private readonly config: ConfigService) {
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

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const token = authHeader.slice(7);
    const region = this.keyToRegion.get(token);
    if (region === undefined) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Attach the API key and region for analytics/logging
    request.apiKey = token;
    request.region = region;
    return true;
  }
}
