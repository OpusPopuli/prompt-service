import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { correlationStorage } from './correlation.storage';

const MAX_CORRELATION_ID_LENGTH = 128;

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Accept caller-supplied ID only if within a reasonable length bound to
    // prevent oversized values from inflating log payloads. Generate a UUID
    // otherwise. nodeId and endpoint are stamped later by HttpMetricsInterceptor
    // after the request is routed and authenticated.
    const incoming = req.headers['x-correlation-id'] as string | undefined;
    const correlationId =
      incoming && incoming.length <= MAX_CORRELATION_ID_LENGTH
        ? incoming
        : randomUUID();

    res.setHeader('x-correlation-id', correlationId);

    correlationStorage.run({ correlationId }, next);
  }
}
