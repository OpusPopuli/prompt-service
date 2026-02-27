import { apiPost } from '../utils';

describe('Structural Analysis Prompt (integration)', () => {
  const validPayload = {
    dataType: 'propositions',
    contentGoal: 'Extract ballot measures',
    html: '<div class="measure"><h3>Prop 36</h3></div>',
  };

  it('should render prompt with interpolated variables and proposition schema', async () => {
    const res = await apiPost('/prompts/structural-analysis', {
      body: validPayload,
    });

    expect(res.status).toBe(201);
    expect(res.body.promptText).toContain('propositions');
    expect(res.body.promptText).toContain('Extract ballot measures');
    expect(res.body.promptText).toContain('Prop 36');
    // Should include proposition schema text
    expect(res.body.promptText).toContain('externalId');
    expect(res.body.promptText).toContain('electionDate');
  });

  it('should fall back to default schema for unknown dataType', async () => {
    const res = await apiPost('/prompts/structural-analysis', {
      body: { ...validPayload, dataType: 'unknown-type' },
    });

    expect(res.status).toBe(201);
    expect(res.body.promptText).toContain(
      'Extract all relevant structured data',
    );
  });

  it('should include hints section when provided', async () => {
    const res = await apiPost('/prompts/structural-analysis', {
      body: {
        ...validPayload,
        hints: ['Look for the main table', 'Dates are in MM/DD format'],
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.promptText).toContain('Hints from the region author');
    expect(res.body.promptText).toContain('Look for the main table');
    expect(res.body.promptText).toContain('Dates are in MM/DD format');
  });

  it('should return a 64-char hex hash verifiable via /prompts/verify', async () => {
    const res = await apiPost('/prompts/structural-analysis', {
      body: validPayload,
    });

    expect(res.status).toBe(201);
    expect(res.body.promptHash).toMatch(/^[a-f0-9]{64}$/);

    // Verify the hash
    const verifyRes = await apiPost('/prompts/verify', {
      body: {
        promptHash: res.body.promptHash,
        promptVersion: res.body.promptVersion,
      },
    });

    expect(verifyRes.status).toBe(201);
    expect(verifyRes.body.valid).toBe(true);
    expect(verifyRes.body.templateName).toBe('structural-analysis');
  });

  it('should return expiresAt approximately 300s from now', async () => {
    const before = Date.now();
    const res = await apiPost('/prompts/structural-analysis', {
      body: validPayload,
    });
    const after = Date.now();

    expect(res.status).toBe(201);
    const expiresAt = new Date(res.body.expiresAt).getTime();
    // TTL is 300s in compose env
    expect(expiresAt).toBeGreaterThanOrEqual(before + 290_000);
    expect(expiresAt).toBeLessThanOrEqual(after + 310_000);
  });
});
