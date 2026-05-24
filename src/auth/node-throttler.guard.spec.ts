import { ThrottlerStorage } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { NodeThrottlerGuard } from './node-throttler.guard';

function makeGuard() {
  const storage = {
    increment: jest.fn().mockResolvedValue({
      totalHits: 1,
      timeToExpire: 0,
      isBlocked: false,
      timeToBlockExpire: 0,
    }),
  } as unknown as ThrottlerStorage;
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(undefined),
  } as unknown as Reflector;
  const options = [{ name: 'default', ttl: 60_000, limit: 30 }];
  return new NodeThrottlerGuard(options as never, storage, reflector);
}

describe('NodeThrottlerGuard.getTracker', () => {
  let guard: NodeThrottlerGuard;

  beforeEach(() => {
    guard = makeGuard();
  });

  it('returns node:<nodeId> when nodeId is present', async () => {
    const req = { nodeId: 'uuid-abc', apiKey: 'key-xyz', ip: '1.2.3.4' };
    // Access protected method via type cast for unit testing
    const tracker = await (
      guard as unknown as { getTracker(r: unknown): Promise<string> }
    ).getTracker(req);
    expect(tracker).toBe('node:uuid-abc');
  });

  it('returns key:<sha256> when only apiKey is present (env-var auth path)', async () => {
    const req = { apiKey: 'abcdefgh-rest-of-key', ip: '1.2.3.4' };
    const tracker = await (
      guard as unknown as { getTracker(r: unknown): Promise<string> }
    ).getTracker(req);
    const expectedHash = createHash('sha256')
      .update('abcdefgh-rest-of-key')
      .digest('hex');
    expect(tracker).toBe(`key:${expectedHash}`);
  });

  it('gives distinct buckets to keys that share the same 8-char prefix', async () => {
    const getTracker = (req: unknown) =>
      (
        guard as unknown as { getTracker(r: unknown): Promise<string> }
      ).getTracker(req);

    const t1 = await getTracker({ apiKey: 'dev-key-1' });
    const t2 = await getTracker({ apiKey: 'dev-key-2' });
    expect(t1).not.toBe(t2);
  });

  it('returns ip:<addr> when neither nodeId nor apiKey is set', async () => {
    const req = { ip: '10.0.0.1' };
    const tracker = await (
      guard as unknown as { getTracker(r: unknown): Promise<string> }
    ).getTracker(req);
    expect(tracker).toBe('ip:10.0.0.1');
  });

  it('returns ip:unknown when no identity info at all', async () => {
    const req = {};
    const tracker = await (
      guard as unknown as { getTracker(r: unknown): Promise<string> }
    ).getTracker(req);
    expect(tracker).toBe('ip:unknown');
  });

  it('prefers nodeId over apiKey when both are present', async () => {
    const req = { nodeId: 'node-1', apiKey: 'key-1', ip: '1.2.3.4' };
    const tracker = await (
      guard as unknown as { getTracker(r: unknown): Promise<string> }
    ).getTracker(req);
    expect(tracker).toBe('node:node-1');
  });
});
