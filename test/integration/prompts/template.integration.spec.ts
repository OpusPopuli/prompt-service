/**
 * GET /prompts/:name — raw template fetch for client-side caching (#66).
 *
 * The companion client work in opuspopuli#729 consumes this endpoint to
 * cache templates locally and stop calling the per-call composition
 * endpoints once per bill/document. These tests pin the wire contract.
 */
import { createHash, createHmac } from 'node:crypto';
import { apiGet, apiPost, get, post, hmacPost, adminPost } from '../utils';
import { createTestNode, cleanupTestNodes } from '../utils/fixtures';
import { BASE_URL, API_KEY } from '../utils/config';

describe('GET /prompts/:name (template fetch) — integration', () => {
  afterAll(async () => {
    await cleanupTestNodes();
  });

  describe('Response contract', () => {
    it('returns the raw template with variables, hash, version, and expiresAt', async () => {
      const res = await apiGet('/prompts/rag');

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('rag');
      expect(typeof res.body.templateText).toBe('string');
      expect(res.body.templateText.length).toBeGreaterThan(0);
      expect(Array.isArray(res.body.variables)).toBe(true);
      expect(res.body.promptVersion).toMatch(/^v\d+$/);
      expect(typeof res.body.promptHash).toBe('string');
      expect(res.body.promptHash).toHaveLength(64);
      expect(typeof res.body.expiresAt).toBe('string');
      expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(
        Date.now(),
      );
      expect(res.body).toHaveProperty('experimentId');
      expect(res.body).toHaveProperty('variantName');
    });

    it('`promptHash` matches `GET /:name/hash` (single source of truth)', async () => {
      const tmpl = await apiGet('/prompts/bill-extraction');
      const hashOnly = await apiGet('/prompts/bill-extraction/hash');

      expect(tmpl.status).toBe(200);
      expect(hashOnly.status).toBe(200);
      expect(tmpl.body.promptHash).toBe(hashOnly.body.promptHash);
      expect(tmpl.body.promptVersion).toBe(hashOnly.body.promptVersion);
    });

    it('`promptHash` equals the SHA-256 of the returned templateText', async () => {
      // This is the contract the client relies on for cache invalidation:
      // if the body changes, the hash must change.
      const res = await apiGet('/prompts/rag');

      expect(res.status).toBe(200);
      const computed = createHash('sha256')
        .update(res.body.templateText)
        .digest('hex');
      expect(res.body.promptHash).toBe(computed);
    });

    it('returns 404 for an unknown template', async () => {
      const res = await apiGet('/prompts/this-template-does-not-exist');

      expect(res.status).toBe(404);
      expect(res.body.statusCode).toBe(404);
      expect(res.body.message).toBeDefined();
    });

    it('requires authentication', async () => {
      const res = await get('/prompts/rag');

      expect(res.status).toBe(401);
    });
  });

  describe('Local interpolation parity (the whole point of this endpoint)', () => {
    it('local interpolation of the raw template equals the POST endpoint output', async () => {
      // Fetch raw template, interpolate locally, and assert the result
      // matches what the server-side composition endpoint produces.
      // This is what `@opuspopuli/prompt-client` will do once it adopts
      // the new endpoint (opuspopuli#729).
      const tmpl = await apiGet('/prompts/rag');
      expect(tmpl.status).toBe(200);

      const variables = { CONTEXT: 'integration test context', QUERY: 'q?' };
      const localRender = Object.entries(variables).reduce(
        (text, [k, v]) => text.replaceAll(`{{${k}}}`, v),
        tmpl.body.templateText as string,
      );

      const composed = await apiPost('/prompts/rag', {
        body: { context: variables.CONTEXT, query: variables.QUERY },
      });
      expect(composed.status).toBe(201);

      expect(composed.body.promptText).toBe(localRender);
      // And the hash on both responses should match (they describe the
      // same underlying template).
      expect(composed.body.promptHash).toBe(tmpl.body.promptHash);
    });
  });

  describe('HMAC accept-both-forms (#61 transitional)', () => {
    let nodeId: string;
    let nodeApiKey: string;

    beforeAll(async () => {
      const created = await createTestNode({
        name: `integ-hmac-paths-${Date.now()}`,
        region: 'ca',
      });
      expect(created.status).toBe(201);
      nodeId = created.body.id;
      nodeApiKey = created.body.apiKey;

      await adminPost(`/admin/nodes/${nodeId}/certify`, {
        body: { expiresInDays: 30 },
      });
    });

    it('accepts a signed request via the existing hmacPost helper (canonical form)', async () => {
      // hmacPost signs `/prompts/rag` with no query string, so canonical
      // (originalUrl) equals legacy (path) and the request goes through
      // the canonical branch.
      const res = await hmacPost(
        '/prompts/rag',
        { context: 'hmac path canonical', query: 'q' },
        nodeApiKey,
        nodeId,
      );

      expect(res.status).toBe(201);
    });

    it('rejects a signed request whose path component does not match either form', async () => {
      // Sign a body for /prompts/rag but send to a wrong path → signature
      // computed against /prompts/wrong, server computes for /prompts/rag
      // → neither matches.
      const body = { context: 'wrong path', query: 'q' };
      const bodyStr = JSON.stringify(body);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const bodyHash = createHash('sha256').update(bodyStr).digest('hex');
      const signatureString = `${timestamp}\nPOST\n/prompts/wrong\n${bodyHash}`;
      const signature = createHmac('sha256', nodeApiKey)
        .update(signatureString)
        .digest('base64');

      const res = await post('/prompts/rag', {
        body,
        headers: {
          'x-hmac-signature': signature,
          'x-hmac-timestamp': timestamp,
          'x-hmac-key-id': nodeId,
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('Real client smoke (uses BASE_URL directly)', () => {
    it('is reachable at the published path', async () => {
      // Sanity check that BASE_URL resolves and the endpoint shape is
      // exactly what `@opuspopuli/prompt-client` will fetch.
      const url = `${BASE_URL}/prompts/rag`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.templateText).toBeDefined();
      expect(body.variables).toBeDefined();
      expect(body.expiresAt).toBeDefined();
    });
  });
});
