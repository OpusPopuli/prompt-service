import { adminGet, adminPost, adminPatch, adminDelete, post } from '../utils';
import { createTestNode, cleanupTestNodes } from '../utils/fixtures';

describe('Admin Node Registry (integration)', () => {
  afterAll(async () => {
    await cleanupTestNodes();
  });

  describe('Register node', () => {
    it('should register a new node with generated API key', async () => {
      const res = await createTestNode({
        name: `integ-register-${Date.now()}`,
        region: 'ca',
      });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.apiKey).toBeDefined();
      expect(res.body.apiKey.length).toBe(64); // 32 bytes hex
      expect(res.body.status).toBe('pending');
      expect(res.body.region).toBe('ca');
    });

    it('should reject duplicate node name', async () => {
      const name = `integ-dup-${Date.now()}`;
      const first = await createTestNode({ name });
      expect(first.status).toBe(201);

      const second = await createTestNode({ name });
      expect(second.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject invalid name format', async () => {
      const res = await adminPost('/admin/nodes', {
        body: {
          name: 'Invalid Name With Spaces!',
          region: 'ca',
        },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('List nodes', () => {
    it('should list all nodes', async () => {
      const res = await adminGet('/admin/nodes');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should filter by region', async () => {
      const uniqueRegion = `rgn-${Date.now()}`;
      await createTestNode({
        name: `integ-filter-${Date.now()}`,
        region: uniqueRegion,
      });

      const res = await adminGet(`/admin/nodes?region=${uniqueRegion}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      for (const node of res.body) {
        expect(node.region).toBe(uniqueRegion);
      }
    });

    it('should filter by status', async () => {
      const res = await adminGet('/admin/nodes?status=pending');

      expect(res.status).toBe(200);
      for (const node of res.body) {
        expect(node.status).toBe('pending');
      }
    });
  });

  describe('Get node by ID', () => {
    it('should return node with audit logs', async () => {
      const createRes = await createTestNode({
        name: `integ-get-${Date.now()}`,
      });
      expect(createRes.status).toBe(201);

      const res = await adminGet(`/admin/nodes/${createRes.body.id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createRes.body.id);
      expect(res.body.auditLogs).toBeDefined();
      expect(Array.isArray(res.body.auditLogs)).toBe(true);
      expect(res.body.auditLogs.length).toBeGreaterThanOrEqual(1);
      expect(res.body.auditLogs[0].action).toBe('registered');
    });

    it('should return 404 for non-existent ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await adminGet(`/admin/nodes/${fakeId}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Update node', () => {
    it('should update node metadata', async () => {
      const createRes = await createTestNode({
        name: `integ-update-${Date.now()}`,
        region: 'ca',
      });
      expect(createRes.status).toBe(201);

      const updateRes = await adminPatch(`/admin/nodes/${createRes.body.id}`, {
        body: { region: 'tx' },
      });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.region).toBe('tx');
    });
  });

  describe('Certification lifecycle', () => {
    it('should certify a pending node', async () => {
      const createRes = await createTestNode({
        name: `integ-certify-${Date.now()}`,
      });
      expect(createRes.status).toBe(201);

      const certifyRes = await adminPost(
        `/admin/nodes/${createRes.body.id}/certify`,
        { body: { expiresInDays: 90, reason: 'Integration test' } },
      );

      expect(certifyRes.status).toBe(201);
      expect(certifyRes.body.status).toBe('certified');
      expect(certifyRes.body.certifiedAt).toBeDefined();
      expect(certifyRes.body.certificationExpiresAt).toBeDefined();
    });

    it('should allow a certified node API key to access prompt endpoints', async () => {
      const createRes = await createTestNode({
        name: `integ-access-${Date.now()}`,
        region: 'ny',
      });
      expect(createRes.status).toBe(201);
      const nodeApiKey = createRes.body.apiKey;

      // Certify the node
      const certifyRes = await adminPost(
        `/admin/nodes/${createRes.body.id}/certify`,
        { body: { expiresInDays: 30 } },
      );
      expect(certifyRes.status).toBe(201);

      // Use the node's API key to access a prompt endpoint
      const promptRes = await post('/prompts/rag', {
        headers: { Authorization: `Bearer ${nodeApiKey}` },
        body: { context: 'Test context', query: 'Test query' },
      });

      expect(promptRes.status).toBe(201);
      expect(promptRes.body.promptText).toBeDefined();
    });

    it('should decertify a node and revoke API access', async () => {
      const createRes = await createTestNode({
        name: `integ-decertify-${Date.now()}`,
      });
      expect(createRes.status).toBe(201);
      const nodeApiKey = createRes.body.apiKey;

      // Certify
      await adminPost(`/admin/nodes/${createRes.body.id}/certify`, {
        body: {},
      });

      // Decertify
      const decertifyRes = await adminPost(
        `/admin/nodes/${createRes.body.id}/decertify`,
        { body: { reason: 'Terms violation' } },
      );
      expect(decertifyRes.status).toBe(201);
      expect(decertifyRes.body.status).toBe('decertified');

      // Verify API key no longer works
      const promptRes = await post('/prompts/rag', {
        headers: { Authorization: `Bearer ${nodeApiKey}` },
        body: { context: 'Test', query: 'Test' },
      });
      expect(promptRes.status).toBe(401);
    });

    it('should recertify a previously decertified node', async () => {
      const createRes = await createTestNode({
        name: `integ-recertify-${Date.now()}`,
      });
      expect(createRes.status).toBe(201);

      // Certify then decertify
      await adminPost(`/admin/nodes/${createRes.body.id}/certify`, {
        body: {},
      });
      await adminPost(`/admin/nodes/${createRes.body.id}/decertify`, {
        body: { reason: 'Temporary suspension' },
      });

      // Recertify
      const recertifyRes = await adminPost(
        `/admin/nodes/${createRes.body.id}/recertify`,
        { body: { expiresInDays: 180, reason: 'Issue resolved' } },
      );

      expect(recertifyRes.status).toBe(201);
      expect(recertifyRes.body.status).toBe('certified');
      expect(recertifyRes.body.decertifiedAt).toBeNull();
    });
  });

  describe('API key rotation', () => {
    it('should generate a new API key and invalidate the old one', async () => {
      const createRes = await createTestNode({
        name: `integ-rotate-${Date.now()}`,
      });
      expect(createRes.status).toBe(201);
      const oldKey = createRes.body.apiKey;

      // Certify the node
      await adminPost(`/admin/nodes/${createRes.body.id}/certify`, {
        body: {},
      });

      // Rotate key
      const rotateRes = await adminPost(
        `/admin/nodes/${createRes.body.id}/rotate-key`,
        {},
      );

      expect(rotateRes.status).toBe(201);
      expect(rotateRes.body.apiKey).toBeDefined();
      expect(rotateRes.body.apiKey).not.toBe(oldKey);

      // Old key should no longer work
      const oldKeyRes = await post('/prompts/rag', {
        headers: { Authorization: `Bearer ${oldKey}` },
        body: { context: 'Test', query: 'Test' },
      });
      expect(oldKeyRes.status).toBe(401);

      // New key should work (node is still certified)
      const newKeyRes = await post('/prompts/rag', {
        headers: { Authorization: `Bearer ${rotateRes.body.apiKey}` },
        body: { context: 'Test', query: 'Test' },
      });
      expect(newKeyRes.status).toBe(201);
    });
  });

  describe('Health dashboard', () => {
    it('should return aggregated node status info', async () => {
      const res = await adminGet('/admin/nodes/health');

      expect(res.status).toBe(200);
      expect(typeof res.body.totalNodes).toBe('number');
      expect(res.body.byStatus).toBeDefined();
      expect(Array.isArray(res.body.expiringIn30Days)).toBe(true);
      expect(Array.isArray(res.body.recentlyRegistered)).toBe(true);
    });
  });

  describe('Delete node', () => {
    it('should delete a node', async () => {
      const createRes = await createTestNode({
        name: `integ-delete-${Date.now()}`,
      });
      expect(createRes.status).toBe(201);
      const id = createRes.body.id;

      const deleteRes = await adminDelete(`/admin/nodes/${id}`);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.deleted).toBe(true);

      // Verify it's gone
      const getRes = await adminGet(`/admin/nodes/${id}`);
      expect(getRes.status).toBe(404);
    });
  });
});
