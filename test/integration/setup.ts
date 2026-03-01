/**
 * Global setup for integration tests.
 * Polls the prompt service health endpoint until it's ready with seeded templates.
 */

const TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

export default async function globalSetup() {
  const baseUrl = process.env.PROMPT_SERVICE_URL || 'http://localhost:3201';
  const healthUrl = `${baseUrl}/health`;

  console.log(`\nWaiting for prompt service at ${healthUrl}...`);

  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) {
        const body = await res.json();
        if (body.status === 'ok' && body.activeTemplates >= 12) {
          console.log(
            `Prompt service ready: ${body.activeTemplates} templates loaded\n`,
          );
          return;
        }
        console.log(
          `Service responded but not ready yet (status=${body.status}, templates=${body.activeTemplates})`,
        );
      }
    } catch {
      // Service not up yet
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(
    `Prompt service did not become healthy within ${TIMEOUT_MS / 1000}s.\n` +
      'Make sure docker compose is running:\n' +
      '  pnpm integration:up\n' +
      'Or run the full integration suite:\n' +
      '  pnpm test:integration:docker',
  );
}
