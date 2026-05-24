import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'node:crypto';

/**
 * Extends the default IP-based throttler to key buckets on the authenticated
 * node identity populated by ApiKeyGuard. Must be applied AFTER ApiKeyGuard
 * so that req.nodeId / req.apiKey are already set.
 *
 * Tracker precedence: nodeId → SHA-256(apiKey) → IP (fallback for unauthenticated
 * paths, which shouldn't reach this guard in practice).
 */
@Injectable()
export class NodeThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const nodeId = req.nodeId as string | undefined;
    if (nodeId) return `node:${nodeId}`;

    const apiKey = req.apiKey as string | undefined;
    if (apiKey) {
      // Hash the full key so every distinct key gets its own bucket regardless
      // of shared prefixes (e.g. dev-key-1 and dev-key-2 both start with "dev-key-").
      const hash = createHash('sha256').update(apiKey).digest('hex');
      return `key:${hash}`;
    }

    // Fallback: use Express ip (set by platform)
    const ip = (req.ip as string | undefined) ?? 'unknown';
    return `ip:${ip}`;
  }
}
