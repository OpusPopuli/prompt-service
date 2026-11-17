import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  emptyManifest,
  Manifest,
  normalize,
  SeedTemplate,
  TemplateLabel,
} from './manifest';

/**
 * Reading and writing the attestation record on disk (opuspopuli#1450).
 *
 * Kept apart from the rules in `manifest.ts` so those stay pure. Takes the
 * record's directory as a parameter: never imports `prisma/seed.ts`, because
 * anything under `src/` is compiled by `nest build`, and pulling `prisma/`
 * into that build would move `dist/main.js`.
 */

export const MANIFEST_FILE = 'manifest.json';
export const TEMPLATES_DIR = 'templates';

export interface AttestationRecord {
  manifest: Manifest;
  files: Map<string, Buffer>;
}

export function readRecord(dir: string): AttestationRecord {
  let manifest: Manifest;
  try {
    manifest = JSON.parse(
      readFileSync(join(dir, MANIFEST_FILE), 'utf8'),
    ) as Manifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    manifest = emptyManifest();
  }

  const files = new Map<string, Buffer>();
  let names: string[] = [];
  try {
    names = readdirSync(join(dir, TEMPLATES_DIR));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  for (const name of names) {
    files.set(name, readFileSync(join(dir, TEMPLATES_DIR, name)));
  }
  return { manifest, files };
}

/**
 * Write the manifest, and a file for each newly published text.
 *
 * Never deletes or overwrites a template file: the record is append-only, and
 * a file's name is the hash of its bytes, so an existing file is already right.
 */
export function writeRecord(
  dir: string,
  manifest: Manifest,
  newTexts: Map<string, string>,
): void {
  mkdirSync(join(dir, TEMPLATES_DIR), { recursive: true });
  for (const [hash, text] of newTexts) {
    writeFileSync(join(dir, TEMPLATES_DIR, `${hash}.txt`), text, {
      encoding: 'utf8',
      flag: 'wx',
    });
  }
  writeFileSync(
    join(dir, MANIFEST_FILE),
    `${JSON.stringify(normalize(manifest), null, 2)}\n`,
    'utf8',
  );
}

/** The seed's `prompts` as published labels: an omitted version is 1. */
export function toSeedTemplates(
  prompts: ReadonlyArray<
    Pick<SeedTemplate, 'name' | 'templateText'> &
      Partial<Pick<TemplateLabel, 'version'>>
  >,
): SeedTemplate[] {
  return prompts.map((p) => ({
    name: p.name,
    version: p.version ?? 1,
    templateText: p.templateText,
  }));
}
