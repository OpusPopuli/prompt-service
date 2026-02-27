import { adminPost, adminDelete } from './http-client';
import { getDb } from './db-helpers';

let createdTemplateIds: string[] = [];

export async function createTestTemplate(
  overrides: Record<string, unknown> = {},
) {
  const defaults = {
    name: `test-template-${Date.now()}`,
    category: 'rag',
    description: 'Integration test template',
    templateText: 'Test template with {{VAR}}',
    variables: ['VAR'],
    changeNote: 'Integration test',
  };

  const res = await adminPost('/admin/templates', {
    body: { ...defaults, ...overrides },
  });

  if (res.status === 201) {
    createdTemplateIds.push(res.body.id);
  }

  return res;
}

export async function getSeededTemplate(name: string) {
  const db = getDb();
  return db.promptTemplate.findFirst({ where: { name, isActive: true } });
}

export async function cleanupTestTemplates() {
  for (const id of createdTemplateIds) {
    await adminDelete(`/admin/templates/${id}`).catch(() => {});
  }
  createdTemplateIds = [];
}
