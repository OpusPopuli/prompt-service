import { get } from '../utils';

describe('Health (integration)', () => {
  it('should return ok status with connected database and seeded templates', async () => {
    const res = await get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('connected');
    expect(res.body.activeTemplates).toBeGreaterThanOrEqual(12);
  });

  it('should return a valid ISO timestamp', async () => {
    const res = await get('/health');

    expect(res.status).toBe(200);
    const date = new Date(res.body.timestamp);
    expect(date.toISOString()).toBe(res.body.timestamp);
  });

  it('should not require authentication', async () => {
    // No Authorization header
    const res = await get('/health');
    expect(res.status).toBe(200);
  });
});
