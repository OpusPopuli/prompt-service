/**
 * Maintain the public prompt attestation record (opuspopuli#1450).
 *
 *   pnpm attestation:generate   publish what prisma/seed.ts seeds today
 *   pnpm attestation:check      verify the record (CI runs the same rules
 *                               through src/attestation/record.spec.ts)
 *   pnpm attestation:check --base <git ref>
 *                               also verify nothing published at <ref> was
 *                               removed or relabelled (CI: the PR's base)
 *   pnpm attestation:backfill   one-time: publish every template text that
 *                               any commit of prisma/seed.ts ever seeded
 *
 * See attestation/README.md for what the record is and how to verify it.
 */
import { execFileSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import { join } from 'node:path';
import * as vm from 'node:vm';
import * as ts from 'typescript';
import { prompts } from '../prisma/seed';
import {
  addTemplates,
  ambiguousLabels,
  emptyManifest,
  Manifest,
  SeedTemplate,
  verifyAppendOnly,
  verifyManifest,
} from '../src/attestation/manifest';
import {
  readRecord,
  toSeedTemplates,
  writeRecord,
} from '../src/attestation/record-io';

const ROOT = join(__dirname, '..');
const RECORD_DIR = join(ROOT, 'attestation');
const SEED_PATH = 'prisma/seed.ts';

function fail(lines: string[]): never {
  for (const line of lines) console.error(`  ✗ ${line}`);
  process.exit(1);
}

function generate(): void {
  const { manifest } = readRecord(RECORD_DIR);
  const result = addTemplates(manifest, toSeedTemplates(prompts));
  if (result.conflicts.length > 0) fail(result.conflicts);
  writeRecord(RECORD_DIR, result.manifest, result.newTexts);
  console.log(
    `Published ${result.newTexts.size} new template text(s); ` +
      `${result.manifest.entries.length} in the record.`,
  );
}

/** The manifest as committed at `ref`, or undefined if it did not exist yet. */
function manifestAt(ref: string): Manifest | undefined {
  try {
    return JSON.parse(
      git('show', `${ref}:attestation/manifest.json`),
    ) as Manifest;
  } catch {
    // Only "no such path at that ref" is expected; a bad ref must not pass.
    git('rev-parse', '--verify', `${ref}^{commit}`);
    return undefined;
  }
}

function check(): void {
  const { manifest, files } = readRecord(RECORD_DIR);
  const problems = verifyManifest(manifest, files, toSeedTemplates(prompts));

  const at = process.argv.indexOf('--base');
  if (at !== -1) {
    const ref = process.argv[at + 1];
    if (!ref) fail(['--base needs a git ref']);
    const base = manifestAt(ref);
    if (base) problems.push(...verifyAppendOnly(base, manifest));
    else console.log(`No record at ${ref}; append-only check skipped.`);
  }

  if (problems.length > 0) fail(problems);
  console.log(`Attestation record OK: ${manifest.entries.length} texts.`);
}

// ── backfill ────────────────────────────────────────────────────────────────

function git(...args: string[]): string {
  return execFileSync('git', ['-C', ROOT, ...args], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    // Callers decide what a failure means; don't echo git's stderr for an
    // expected miss (no record at a ref that predates it).
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * A stand-in PrismaClient that records every template the seed upserts and
 * touches nothing. Older seeds have no `require.main` guard and no `prompts`
 * export, so loading one runs `main()` — against this, harmlessly.
 *
 * NOT a security boundary. `node:vm` does not isolate code (a constructor
 * chain reaches the host `process`); it only keeps a seed's own `require`,
 * `process.exit` and database calls away from ours. That is enough because the
 * only input is this repository's main-line history — never point the backfill
 * at refs nobody here reviewed.
 */
function recordingPrismaClient(captured: SeedTemplate[]): unknown {
  const model = {
    upsert: async (args: { create: SeedTemplate }) => {
      captured.push(args.create);
      // An older seed reads `template.version` back; an omitted one is 1.
      return { id: 'stub', ...args.create, version: args.create.version ?? 1 };
    },
    findFirst: async () => null,
    create: async () => ({}),
    updateMany: async () => ({ count: 0 }),
  };
  return class {
    constructor() {
      return new Proxy(
        {},
        {
          get: (_target, prop) => {
            if (prop === '$disconnect') return async () => undefined;
            if (prop === '$queryRaw' || prop === '$executeRaw') {
              return async () => [];
            }
            return model;
          },
        },
      );
    }
  };
}

/** The templates a historical seed.ts seeded, without a database. */
async function templatesAt(source: string): Promise<SeedTemplate[]> {
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
    },
  }).outputText;

  const captured: SeedTemplate[] = [];
  const mod: { exports: { prompts?: SeedTemplate[] } } = { exports: {} };
  const sandboxRequire = (id: string): unknown => {
    if (id === 'dotenv/config') return {};
    if (id === '@prisma/client') {
      return { PrismaClient: recordingPrismaClient(captured) };
    }
    if (id === 'node:crypto' || id === 'crypto') return crypto;
    throw new Error(`seed requires unexpected module "${id}"`);
  };
  vm.runInNewContext(
    js,
    {
      module: mod,
      exports: mod.exports,
      // `require.main` is undefined, never `module`: a guarded seed must
      // not run its main().
      require: Object.assign(sandboxRequire, { main: undefined }),
      process: { env: {}, exit: () => undefined },
      console: { log: () => undefined, error: () => undefined },
    },
    { timeout: 10_000 },
  );
  if (Array.isArray(mod.exports.prompts)) {
    return toSeedTemplates(mod.exports.prompts);
  }
  // An unguarded seed's main() is async: let its upserts finish, then make
  // sure they have. A capture still growing, or empty, would publish a
  // partial history silently.
  await drain();
  const settled = captured.length;
  await drain();
  if (settled === 0 || captured.length !== settled) {
    throw new Error(
      `seed capture did not settle (${settled} then ${captured.length})`,
    );
  }
  return toSeedTemplates(captured);
}

async function drain(): Promise<void> {
  for (let i = 0; i < 200; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function backfill(): Promise<void> {
  const { manifest: existing } = readRecord(RECORD_DIR);
  let manifest: Manifest = existing.entries.length ? existing : emptyManifest();
  const newTexts = new Map<string, string>();

  const commits = git('log', '--reverse', '--format=%H', '--', SEED_PATH)
    .trim()
    .split('\n');
  for (const sha of commits) {
    const templates = await templatesAt(git('show', `${sha}:${SEED_PATH}`));
    const result = addTemplates(manifest, templates, {
      allowNewAmbiguity: true,
    });
    manifest = result.manifest;
    for (const [hash, text] of result.newTexts) newTexts.set(hash, text);
  }
  const current = addTemplates(manifest, toSeedTemplates(prompts), {
    allowNewAmbiguity: true,
  });
  for (const [hash, text] of current.newTexts) newTexts.set(hash, text);

  // History is what it is: record its ambiguous labels once, visibly.
  manifest = {
    ...current.manifest,
    grandfatheredLabels: ambiguousLabels(current.manifest),
  };
  writeRecord(RECORD_DIR, manifest, newTexts);
  console.log(
    `Backfilled ${commits.length} commit(s): ${manifest.entries.length} texts, ` +
      `${manifest.grandfatheredLabels.length} grandfathered label(s).`,
  );
}

const commands: Record<string, () => void | Promise<void>> = {
  generate,
  check,
  backfill,
};

const command = commands[process.argv[2] ?? ''];
if (!command) {
  fail([`usage: prompt-manifest <${Object.keys(commands).join('|')}>`]);
}
Promise.resolve(command())
  .then(() => process.exit(0))
  .catch((error: unknown) =>
    fail([
      error instanceof Error
        ? (error.stack ?? error.message)
        : `${error as string}`,
    ]),
  );
