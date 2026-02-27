import { adminPost, adminGet } from '../utils';
import { createTestTemplate, cleanupTestTemplates } from '../utils/fixtures';
import { cleanTestData } from '../utils/db-helpers';

describe('Experiments (integration)', () => {
  let templateId: string;
  let versionId: string;

  beforeAll(async () => {
    // Create a template for experiments
    const res = await createTestTemplate({
      name: `integ-exp-tmpl-${Date.now()}`,
      templateText: 'Experiment template {{CONTEXT}} {{QUERY}}',
      variables: ['CONTEXT', 'QUERY'],
      category: 'rag',
    });
    expect(res.status).toBe(201);
    templateId = res.body.id;

    // Get the version history to find the versionId
    const detail = await adminGet(`/admin/templates/${templateId}`);
    versionId = detail.body.versionHistory[0].id;
  });

  afterAll(async () => {
    await cleanTestData();
    await cleanupTestTemplates();
  });

  describe('Create experiment', () => {
    it('should create an experiment in draft status with 2 variants', async () => {
      const res = await adminPost('/admin/experiments', {
        body: {
          name: `integ-exp-${Date.now()}`,
          description: 'Integration test experiment',
          templateId,
          variants: [
            { name: 'control', versionId, trafficPct: 50 },
            { name: 'variant-a', versionId, trafficPct: 50 },
          ],
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('draft');
      expect(res.body.variants).toHaveLength(2);
    });

    it('should reject traffic not summing to 100', async () => {
      const res = await adminPost('/admin/experiments', {
        body: {
          name: `integ-exp-bad-traffic-${Date.now()}`,
          templateId,
          variants: [
            { name: 'control', versionId, trafficPct: 30 },
            { name: 'variant-a', versionId, trafficPct: 30 },
          ],
        },
      });

      expect(res.status).toBe(400);
    });

    it('should reject non-existent templateId', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await adminPost('/admin/experiments', {
        body: {
          name: `integ-exp-bad-tmpl-${Date.now()}`,
          templateId: fakeId,
          variants: [
            { name: 'control', versionId, trafficPct: 50 },
            { name: 'variant-a', versionId, trafficPct: 50 },
          ],
        },
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should require at least 2 variants', async () => {
      const res = await adminPost('/admin/experiments', {
        body: {
          name: `integ-exp-one-var-${Date.now()}`,
          templateId,
          variants: [{ name: 'only-one', versionId, trafficPct: 100 }],
        },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('List and get experiments', () => {
    it('should list experiments with variants and template', async () => {
      const res = await adminGet('/admin/experiments');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0].variants).toBeDefined();
        expect(res.body[0].template).toBeDefined();
      }
    });

    it('should get experiment details', async () => {
      // Create one first
      const createRes = await adminPost('/admin/experiments', {
        body: {
          name: `integ-exp-detail-${Date.now()}`,
          templateId,
          variants: [
            { name: 'control', versionId, trafficPct: 50 },
            { name: 'variant-b', versionId, trafficPct: 50 },
          ],
        },
      });
      expect(createRes.status).toBe(201);

      const res = await adminGet(`/admin/experiments/${createRes.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createRes.body.id);
      expect(res.body.variants).toHaveLength(2);
    });
  });

  describe('Lifecycle', () => {
    it('should activate a draft experiment', async () => {
      const createRes = await adminPost('/admin/experiments', {
        body: {
          name: `integ-exp-activate-${Date.now()}`,
          templateId,
          variants: [
            { name: 'control', versionId, trafficPct: 50 },
            { name: 'variant-a', versionId, trafficPct: 50 },
          ],
        },
      });
      expect(createRes.status).toBe(201);

      const activateRes = await adminPost(
        `/admin/experiments/${createRes.body.id}/activate`,
      );
      expect(activateRes.status).toBe(201);
      expect(activateRes.body.status).toBe('active');
    });

    it('should reject activating a non-draft experiment', async () => {
      const createRes = await adminPost('/admin/experiments', {
        body: {
          name: `integ-exp-double-act-${Date.now()}`,
          templateId,
          variants: [
            { name: 'control', versionId, trafficPct: 50 },
            { name: 'variant-a', versionId, trafficPct: 50 },
          ],
        },
      });

      await adminPost(`/admin/experiments/${createRes.body.id}/activate`);

      const secondActivate = await adminPost(
        `/admin/experiments/${createRes.body.id}/activate`,
      );
      expect(secondActivate.status).toBe(400);
    });

    it('should stop an active experiment', async () => {
      const createRes = await adminPost('/admin/experiments', {
        body: {
          name: `integ-exp-stop-${Date.now()}`,
          templateId,
          variants: [
            { name: 'control', versionId, trafficPct: 50 },
            { name: 'variant-a', versionId, trafficPct: 50 },
          ],
        },
      });

      await adminPost(`/admin/experiments/${createRes.body.id}/activate`);

      const stopRes = await adminPost(
        `/admin/experiments/${createRes.body.id}/stop`,
      );
      expect(stopRes.status).toBe(201);
      expect(stopRes.body.status).toBe('stopped');
      expect(stopRes.body.stoppedAt).toBeTruthy();
    });
  });
});
