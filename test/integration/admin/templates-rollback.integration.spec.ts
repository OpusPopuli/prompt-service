import { adminGet, adminPatch, adminPost } from '../utils';
import { createTestTemplate, cleanupTestTemplates } from '../utils/fixtures';

describe('Admin Templates Rollback (integration)', () => {
  afterAll(async () => {
    await cleanupTestTemplates();
  });

  it('should rollback to a previous version', async () => {
    // Create v1
    const createRes = await createTestTemplate({
      name: `integ-rollback-${Date.now()}`,
      templateText: 'Version 1 text {{VAR}}',
    });
    expect(createRes.status).toBe(201);
    const id = createRes.body.id;

    // Update to v2
    await adminPatch(`/admin/templates/${id}`, {
      body: {
        templateText: 'Version 2 text {{VAR}}',
        changeNote: 'Update to v2',
      },
    });

    // Rollback to v1 (creates v3 with v1 content)
    const rollbackRes = await adminPost(`/admin/templates/${id}/rollback`, {
      body: { targetVersion: 1 },
    });

    expect(rollbackRes.status).toBe(201);
    expect(rollbackRes.body.version).toBe(3);
    expect(rollbackRes.body.templateText).toContain('Version 1 text');
  });

  it('should have 3 version history entries after rollback', async () => {
    const name = `integ-rollback-hist-${Date.now()}`;
    const createRes = await createTestTemplate({
      name,
      templateText: 'Original {{VAR}}',
    });
    const id = createRes.body.id;

    await adminPatch(`/admin/templates/${id}`, {
      body: { templateText: 'Updated {{VAR}}', changeNote: 'v2' },
    });

    await adminPost(`/admin/templates/${id}/rollback`, {
      body: { targetVersion: 1 },
    });

    const getRes = await adminGet(`/admin/templates/${id}`);
    expect(getRes.body.versionHistory.length).toBe(3);
  });

  it('should return 404 for non-existent version', async () => {
    const createRes = await createTestTemplate({
      name: `integ-rollback-404v-${Date.now()}`,
    });
    const id = createRes.body.id;

    const res = await adminPost(`/admin/templates/${id}/rollback`, {
      body: { targetVersion: 999 },
    });

    expect(res.status).toBe(404);
  });

  it('should return 404 for non-existent template', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await adminPost(`/admin/templates/${fakeId}/rollback`, {
      body: { targetVersion: 1 },
    });

    expect(res.status).toBe(404);
  });
});
