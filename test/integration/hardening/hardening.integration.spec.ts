/**
 * Production hardening guarantees from issue #58.
 *
 * These tests assert wire-contract invariants that, if broken, would
 * silently break currently-deployed `@opuspopuli/prompt-client` consumers.
 * Keep them green even through refactors of main.ts / app.module.ts.
 */
import { get, post, apiPost } from '../utils';
import { INVALID_KEY } from '../utils/config';

describe('Production hardening (integration)', () => {
  describe('Error response body shape — {statusCode, message, error}', () => {
    it('401 missing auth keeps the three-key shape', async () => {
      const res = await post('/prompts/rag', {
        body: { context: 't', query: 't' },
      });

      expect(res.status).toBe(401);
      expect(typeof res.body).toBe('object');
      expect(typeof res.body.statusCode).toBe('number');
      expect(res.body.statusCode).toBe(401);
      expect(res.body.message).toBeDefined();
      expect(res.body.error).toBeDefined();
    });

    it('401 invalid key keeps the three-key shape', async () => {
      const res = await post('/prompts/rag', {
        body: { context: 't', query: 't' },
        headers: { Authorization: `Bearer ${INVALID_KEY}` },
      });

      expect(res.status).toBe(401);
      expect(res.body.statusCode).toBe(401);
      expect(res.body.message).toBeDefined();
      expect(res.body.error).toBeDefined();
    });

    it('404 unknown template keeps the three-key shape', async () => {
      // /:name/hash on a name that doesn't exist returns 404
      const res = await get(
        '/prompts/this-template-does-not-exist-12345/hash',
        {
          headers: { Authorization: `Bearer test-api-key-1` },
        },
      );

      expect(res.status).toBe(404);
      expect(res.body.statusCode).toBe(404);
      expect(res.body.message).toBeDefined();
      expect(res.body.error).toBeDefined();
    });

    it('400 validation failure keeps the three-key shape', async () => {
      // RagDto requires context (string) and query (string).
      // Sending the wrong types triggers ValidationPipe.
      const res = await apiPost('/prompts/rag', {
        body: { context: 12345, query: null },
      });

      expect(res.status).toBe(400);
      expect(res.body.statusCode).toBe(400);
      expect(res.body.message).toBeDefined();
      expect(res.body.error).toBeDefined();
    });

    it('error messages do not contain Prisma internals or stack frames', async () => {
      // Sample several error responses and assert none leak internal details.
      const responses = await Promise.all([
        post('/prompts/rag', { body: { context: 't', query: 't' } }),
        get('/prompts/nope/hash', {
          headers: { Authorization: `Bearer test-api-key-1` },
        }),
      ]);

      for (const res of responses) {
        const serialized = JSON.stringify(res.body).toLowerCase();
        expect(serialized).not.toContain('prisma');
        expect(serialized).not.toContain('postgresql://');
        expect(serialized).not.toContain('at object.<anonymous>');
      }
    });
  });

  describe('Security headers (helmet)', () => {
    it('responses include X-Content-Type-Options: nosniff', async () => {
      const res = await apiPost('/prompts/rag', {
        body: { context: 't', query: 't' },
      });

      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    });

    it('responses do NOT include X-Powered-By (helmet removes it)', async () => {
      const res = await apiPost('/prompts/rag', {
        body: { context: 't', query: 't' },
      });

      expect(res.headers.get('x-powered-by')).toBeNull();
    });
  });

  describe('Swagger gating', () => {
    it('exposes /api in non-production (integration env is non-prod)', async () => {
      const res = await get('/api');
      // Swagger UI typically redirects /api → /api/ then serves HTML.
      // Either a 200 or a 301/302 to a Swagger asset is acceptable.
      // What's NOT acceptable is a 404 here in dev mode.
      expect([200, 301, 302]).toContain(res.status);
    });
  });

  // Admin throttling is verified in two places:
  //   - Unit test: src/admin/admin.controller.ts class-level @Throttle decorator
  //     reads ADMIN_THROTTLE_LIMIT and applies it (manual review of the
  //     decorator path is sufficient here — it's a single line of config).
  //   - Live smoke against the local dev stack with ADMIN_THROTTLE_LIMIT
  //     defaulting to 10 (see PR description).
  //
  // We deliberately do NOT exhaust the admin throttler bucket in the shared
  // integration suite — the suite runs admin-heavy tests (templates,
  // node-registry, experiments) serially, all from the same container IP, so
  // a 429 in one suite pollutes every subsequent admin call within the 60s
  // window. The compose file sets ADMIN_THROTTLE_LIMIT=1000 to keep those
  // suites green.
});
