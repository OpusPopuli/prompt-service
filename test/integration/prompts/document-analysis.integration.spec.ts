import { apiPost } from '../utils';
import { getDb } from '../utils/db-helpers';
import { API_KEY, API_KEY_REGION } from '../utils/config';

describe('Document Analysis Prompt (integration)', () => {
  it('should render petition prompt with civic analyst instruction', async () => {
    const res = await apiPost('/prompts/document-analysis', {
      body: {
        documentType: 'petition',
        text: 'We the undersigned petition for park funding.',
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.promptText).toContain('nonpartisan civic analyst');
    expect(res.body.promptText).toContain(
      'We the undersigned petition for park funding.',
    );
  });

  it('should render proposition prompt', async () => {
    const res = await apiPost('/prompts/document-analysis', {
      body: {
        documentType: 'proposition',
        text: 'Proposition 42 amends the state constitution.',
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.promptText).toContain('ballot proposition');
    expect(res.body.promptText).toContain('Proposition 42');
  });

  it('should fall back to generic for unknown documentType', async () => {
    const res = await apiPost('/prompts/document-analysis', {
      body: {
        documentType: 'unknown-type',
        text: 'Some document text.',
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.promptText).toContain('Analyze this document');
  });

  it('should append base instructions to prompt text', async () => {
    const res = await apiPost('/prompts/document-analysis', {
      body: { documentType: 'petition', text: 'Test text.' },
    });

    expect(res.status).toBe(201);
    expect(res.body.promptText).toContain(
      'Respond with valid JSON only. No markdown, no explanations.',
    );
  });

  it('should log request in prompt_request_logs with correct apiKeyPrefix', async () => {
    const res = await apiPost('/prompts/document-analysis', {
      body: { documentType: 'generic', text: 'Logging test.' },
    });

    expect(res.status).toBe(201);

    // Allow a moment for async logging
    await new Promise((r) => setTimeout(r, 500));

    const db = getDb();
    const logs = await db.promptRequestLog.findMany({
      where: { endpoint: 'document-analysis' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].apiKeyPrefix).toBe(API_KEY.slice(0, 8) + '...');
    expect(logs[0].region).toBe(API_KEY_REGION);
  });
});
