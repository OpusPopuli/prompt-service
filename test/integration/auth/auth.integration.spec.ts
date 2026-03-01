import { createHash, createHmac } from 'node:crypto';
import { post, apiPost, adminGet, adminPost, get, hmacPost } from '../utils';
import { createTestNode, cleanupTestNodes } from '../utils/fixtures';
import { INVALID_KEY, API_KEY } from '../utils/config';

describe('Authentication (integration)', () => {
  afterAll(async () => {
    await cleanupTestNodes();
  });

  describe('Node API key (prompt endpoints)', () => {
    it('should reject requests without auth', async () => {
      const res = await post('/prompts/rag', {
        body: { context: 'test', query: 'test' },
      });

      expect(res.status).toBe(401);
    });

    it('should reject requests with invalid API key', async () => {
      const res = await post('/prompts/rag', {
        body: { context: 'test', query: 'test' },
        headers: { Authorization: `Bearer ${INVALID_KEY}` },
      });

      expect(res.status).toBe(401);
    });

    it('should accept requests with valid API key', async () => {
      const res = await apiPost('/prompts/rag', {
        body: { context: 'test context', query: 'test query' },
      });

      expect(res.status).toBe(201);
    });
  });

  describe('Admin API key (admin endpoints)', () => {
    it('should reject node API key on admin endpoints', async () => {
      const res = await get('/admin/templates', {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });

      expect(res.status).toBe(401);
    });

    it('should reject requests without auth on admin endpoints', async () => {
      const res = await get('/admin/templates');

      expect(res.status).toBe(401);
    });

    it('should accept requests with valid admin API key', async () => {
      const res = await adminGet('/admin/templates');

      expect(res.status).toBe(200);
    });
  });

  describe('HMAC authentication', () => {
    let nodeId: string;
    let nodeApiKey: string;

    beforeAll(async () => {
      // Register and certify a node
      const createRes = await createTestNode({
        name: `integ-hmac-${Date.now()}`,
        region: 'ca',
      });
      expect(createRes.status).toBe(201);
      nodeId = createRes.body.id;
      nodeApiKey = createRes.body.apiKey;

      const certifyRes = await adminPost(`/admin/nodes/${nodeId}/certify`, {
        body: { expiresInDays: 30 },
      });
      expect(certifyRes.status).toBe(201);
    });

    it('should authenticate with valid HMAC signature', async () => {
      const body = { context: 'HMAC test context', query: 'HMAC test query' };
      const res = await hmacPost('/prompts/rag', body, nodeApiKey, nodeId);

      expect(res.status).toBe(201);
      expect(res.body.promptText).toBeDefined();
    });

    it('should reject expired HMAC timestamp', async () => {
      const body = { context: 'test', query: 'test' };
      const bodyStr = JSON.stringify(body);
      const expiredTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
      const bodyHash = createHash('sha256').update(bodyStr).digest('hex');
      const signatureString = `${expiredTimestamp}\nPOST\n/prompts/rag\n${bodyHash}`;
      const signature = createHmac('sha256', nodeApiKey)
        .update(signatureString)
        .digest('base64');

      const res = await post('/prompts/rag', {
        body,
        headers: {
          'x-hmac-signature': signature,
          'x-hmac-timestamp': expiredTimestamp,
          'x-hmac-key-id': nodeId,
        },
      });

      expect(res.status).toBe(401);
    });

    it('should reject tampered body', async () => {
      // Sign with original body, send different body
      const originalBody = { context: 'original', query: 'test' };
      const tamperedBody = { context: 'tampered', query: 'test' };
      const originalStr = JSON.stringify(originalBody);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const bodyHash = createHash('sha256').update(originalStr).digest('hex');
      const signatureString = `${timestamp}\nPOST\n/prompts/rag\n${bodyHash}`;
      const signature = createHmac('sha256', nodeApiKey)
        .update(signatureString)
        .digest('base64');

      const res = await post('/prompts/rag', {
        body: tamperedBody,
        headers: {
          'x-hmac-signature': signature,
          'x-hmac-timestamp': timestamp,
          'x-hmac-key-id': nodeId,
        },
      });

      expect(res.status).toBe(401);
    });

    it('should reject unknown node ID', async () => {
      const body = { context: 'test', query: 'test' };
      const res = await hmacPost(
        '/prompts/rag',
        body,
        nodeApiKey,
        '00000000-0000-0000-0000-000000000000',
      );

      expect(res.status).toBe(401);
    });

    it('should still allow Bearer token auth (backward compat)', async () => {
      const res = await post('/prompts/rag', {
        body: { context: 'bearer test', query: 'bearer test' },
        headers: { Authorization: `Bearer ${nodeApiKey}` },
      });

      expect(res.status).toBe(201);
    });
  });
});
