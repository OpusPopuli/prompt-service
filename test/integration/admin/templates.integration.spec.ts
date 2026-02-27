import { adminGet, adminPost, adminPatch, adminDelete } from '../utils';
import { createTestTemplate, cleanupTestTemplates } from '../utils/fixtures';

describe('Admin Templates (integration)', () => {
  afterAll(async () => {
    await cleanupTestTemplates();
  });

  describe('List templates', () => {
    it('should list all seeded templates', async () => {
      const res = await adminGet('/admin/templates');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(12);
    });

    it('should filter by category', async () => {
      const res = await adminGet(
        '/admin/templates?category=structural_analysis',
      );

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(5);
      for (const t of res.body) {
        expect(t.category).toBe('structural_analysis');
      }
    });

    it('should filter by isActive', async () => {
      const res = await adminGet('/admin/templates?isActive=true');

      expect(res.status).toBe(200);
      for (const t of res.body) {
        expect(t.isActive).toBe(true);
      }
    });
  });

  describe('Get template by ID', () => {
    it('should return template with version history', async () => {
      const listRes = await adminGet('/admin/templates');
      const templateId = listRes.body[0].id;

      const res = await adminGet(`/admin/templates/${templateId}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(templateId);
      expect(res.body.versionHistory).toBeDefined();
      expect(Array.isArray(res.body.versionHistory)).toBe(true);
    });

    it('should return 404 for non-existent ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await adminGet(`/admin/templates/${fakeId}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Create template', () => {
    it('should create a new template with version 1', async () => {
      const res = await createTestTemplate({
        name: `integ-create-${Date.now()}`,
      });

      expect(res.status).toBe(201);
      expect(res.body.version).toBe(1);
      expect(res.body.isActive).toBe(true);
    });

    it('should reject duplicate name', async () => {
      const name = `integ-dup-${Date.now()}`;
      const first = await createTestTemplate({ name });
      expect(first.status).toBe(201);

      const second = await createTestTemplate({ name });
      expect(second.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject invalid name format', async () => {
      const res = await adminPost('/admin/templates', {
        body: {
          name: 'Invalid Name With Spaces!',
          category: 'rag',
          description: 'test',
          templateText: 'test',
        },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('Update template', () => {
    it('should increment version and create history entry', async () => {
      const createRes = await createTestTemplate({
        name: `integ-update-${Date.now()}`,
      });
      expect(createRes.status).toBe(201);
      const id = createRes.body.id;

      const updateRes = await adminPatch(`/admin/templates/${id}`, {
        body: {
          templateText: 'Updated template text {{VAR}}',
          changeNote: 'Updated in integration test',
        },
      });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.version).toBe(2);

      // Check version history
      const getRes = await adminGet(`/admin/templates/${id}`);
      expect(getRes.body.versionHistory.length).toBe(2);
    });

    it('should return 404 for non-existent template', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await adminPatch(`/admin/templates/${fakeId}`, {
        body: {
          templateText: 'new text',
          changeNote: 'test',
        },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('Delete template', () => {
    it('should soft-delete (set isActive to false)', async () => {
      const createRes = await createTestTemplate({
        name: `integ-delete-${Date.now()}`,
      });
      expect(createRes.status).toBe(201);
      const id = createRes.body.id;

      const deleteRes = await adminDelete(`/admin/templates/${id}`);
      expect(deleteRes.status).toBe(200);

      const getRes = await adminGet(`/admin/templates/${id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.isActive).toBe(false);
    });
  });
});
