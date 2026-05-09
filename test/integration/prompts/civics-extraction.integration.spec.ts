import { apiPost } from '../utils';
import { getDb } from '../utils/db-helpers';
import { API_KEY, API_KEY_REGION } from '../utils/config';

const BASE_PAYLOAD = {
  regionId: 'california',
  sourceUrl: 'https://www.assembly.ca.gov/resources/glossary',
  contentGoal: 'Extract the official Assembly glossary',
  html: '<html><body><h1>Glossary</h1><p>Engrossed: proofread after amendment.</p></body></html>',
};

describe('Civics Extraction Prompt (integration)', () => {
  it('renders prompt with all interpolated fields', async () => {
    const res = await apiPost('/prompts/civics-extraction', {
      body: {
        ...BASE_PAYLOAD,
        category: 'Assembly',
        hints: ['~150 terms organized A-Z'],
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.promptText).toContain('california');
    expect(res.body.promptText).toContain(BASE_PAYLOAD.sourceUrl);
    expect(res.body.promptText).toContain(BASE_PAYLOAD.contentGoal);
    expect(res.body.promptText).toContain('Category: Assembly');
    expect(res.body.promptText).toContain('- ~150 terms organized A-Z');
    expect(res.body.promptText).toContain('Engrossed: proofread after amendment.');
    expect(res.body.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.promptVersion).toMatch(/^v\d+$/);
    expect(res.body.expiresAt).toBeDefined();
  });

  it('omits Category line when category is not provided', async () => {
    const res = await apiPost('/prompts/civics-extraction', {
      body: BASE_PAYLOAD,
    });

    expect(res.status).toBe(201);
    expect(res.body.promptText).not.toContain('Category:');
  });

  it('omits hints section when hints are not provided', async () => {
    const res = await apiPost('/prompts/civics-extraction', {
      body: BASE_PAYLOAD,
    });

    expect(res.status).toBe(201);
    expect(res.body.promptText).not.toContain('Hints from the region author');
  });

  it('includes hints section with bullet formatting when hints are provided', async () => {
    const res = await apiPost('/prompts/civics-extraction', {
      body: { ...BASE_PAYLOAD, hints: ['hint one', 'hint two'] },
    });

    expect(res.status).toBe(201);
    expect(res.body.promptText).toContain('## Hints from the region author');
    expect(res.body.promptText).toContain('- hint one');
    expect(res.body.promptText).toContain('- hint two');
  });

  it('accepts large HTML payloads above the default 100KB body-parser limit', async () => {
    const largeHtml = '<p>' + 'A'.repeat(200_000) + '</p>';

    const res = await apiPost('/prompts/civics-extraction', {
      body: { ...BASE_PAYLOAD, html: largeHtml },
    });

    // Must not 413 — the 5MB body-parser bump in main.ts allows this
    expect(res.status).toBe(201);
    expect(res.body.promptText).toContain('A'.repeat(100));
  });

  it('returns 401 without auth', async () => {
    const res = await fetch(
      `${process.env.PROMPT_SERVICE_URL || 'http://localhost:3201'}/prompts/civics-extraction`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(BASE_PAYLOAD),
      },
    );

    expect(res.status).toBe(401);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await apiPost('/prompts/civics-extraction', {
      body: { regionId: 'california' }, // missing sourceUrl, contentGoal, html
    });

    expect(res.status).toBe(400);
  });

  it('logs the request in prompt_request_logs', async () => {
    await apiPost('/prompts/civics-extraction', {
      body: { ...BASE_PAYLOAD, category: 'Senate' },
    });

    await new Promise((r) => setTimeout(r, 500));

    const db = getDb();
    const logs = await db.promptRequestLog.findMany({
      where: { endpoint: 'civics-extraction' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].apiKeyPrefix).toBe(API_KEY.slice(0, 8) + '...');
    expect(logs[0].region).toBe(API_KEY_REGION);
  });
});
