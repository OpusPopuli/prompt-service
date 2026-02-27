import { post, apiPost, adminGet, get } from '../utils';
import { INVALID_KEY, API_KEY } from '../utils/config';

describe('Authentication (integration)', () => {
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
});
