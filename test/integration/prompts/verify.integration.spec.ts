import { apiPost } from '../utils';
import { getSeededTemplate } from '../utils/fixtures';
import { createHash } from 'node:crypto';

describe('Verify Prompt (integration)', () => {
  it('should verify a valid hash from a prompt response', async () => {
    const promptRes = await apiPost('/prompts/rag', {
      body: { context: 'ctx', query: 'q' },
    });
    expect(promptRes.status).toBe(201);

    const verifyRes = await apiPost('/prompts/verify', {
      body: {
        promptHash: promptRes.body.promptHash,
        promptVersion: promptRes.body.promptVersion,
      },
    });

    expect(verifyRes.status).toBe(201);
    expect(verifyRes.body.valid).toBe(true);
    expect(verifyRes.body.templateName).toBe('rag');
  });

  it('should return invalid for a wrong hash', async () => {
    const res = await apiPost('/prompts/verify', {
      body: {
        promptHash: 'a'.repeat(64),
        promptVersion: 'v1',
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.valid).toBe(false);
  });

  it('should return invalid for version mismatch', async () => {
    const promptRes = await apiPost('/prompts/rag', {
      body: { context: 'ctx', query: 'q' },
    });

    const res = await apiPost('/prompts/verify', {
      body: {
        promptHash: promptRes.body.promptHash,
        promptVersion: 'v999',
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.valid).toBe(false);
  });

  it('should verify a known seeded template hash', async () => {
    const template = await getSeededTemplate('rag');
    expect(template).toBeTruthy();

    const hash = createHash('sha256')
      .update(template!.templateText)
      .digest('hex');

    const res = await apiPost('/prompts/verify', {
      body: {
        promptHash: hash,
        promptVersion: `v${template!.version}`,
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.valid).toBe(true);
    expect(res.body.templateName).toBe('rag');
  });
});
