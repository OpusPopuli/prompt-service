import { apiPost } from '../utils';

describe('RAG Prompt (integration)', () => {
  it('should render prompt with context and query', async () => {
    const res = await apiPost('/prompts/rag', {
      body: {
        context: 'The city council met on Tuesday to discuss zoning.',
        query: 'When did the council meet?',
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.promptText).toContain(
      'The city council met on Tuesday to discuss zoning.',
    );
    expect(res.body.promptText).toContain('When did the council meet?');
  });

  it('should include context-only instruction', async () => {
    const res = await apiPost('/prompts/rag', {
      body: { context: 'Some context.', query: 'A question?' },
    });

    expect(res.status).toBe(201);
    expect(res.body.promptText).toContain('ONLY information from the context');
  });

  it('should return valid metadata (hash, version, expiresAt)', async () => {
    const res = await apiPost('/prompts/rag', {
      body: { context: 'Context.', query: 'Query?' },
    });

    expect(res.status).toBe(201);
    expect(res.body.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.promptVersion).toMatch(/^v\d+$/);
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('should return 400 for missing required fields', async () => {
    const res = await apiPost('/prompts/rag', {
      body: { context: 'Only context, no query' },
    });

    expect(res.status).toBe(400);
  });
});
