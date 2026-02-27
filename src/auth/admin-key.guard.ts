import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AdminKeyGuard implements CanActivate {
  private readonly validKeys: Set<string>;

  constructor(private readonly config: ConfigService) {
    const keys = this.config.get<string>('ADMIN_API_KEYS', '');
    this.validKeys = new Set(
      keys
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
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
    if (!this.validKeys.has(token)) {
      throw new UnauthorizedException('Invalid admin API key');
    }

    request.adminKey = token;
    return true;
  }
}
