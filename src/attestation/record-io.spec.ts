import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addTemplates, emptyManifest, hashTemplate } from './manifest';
import {
  MANIFEST_FILE,
  readRecord,
  TEMPLATES_DIR,
  toSeedTemplates,
  writeRecord,
} from './record-io';

describe('record-io', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'attestation-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads a missing record as empty', () => {
    expect(readRecord(dir)).toEqual({
      manifest: emptyManifest(),
      files: new Map(),
    });
  });

  it('round-trips: the file holds exactly the hashed bytes', () => {
    const text = 'line one\nnaïve — “quoted”\n';
    const { manifest, newTexts } = addTemplates(emptyManifest(), [
      { name: 'a', version: 1, templateText: text },
    ]);
    writeRecord(dir, manifest, newTexts);

    const read = readRecord(dir);
    expect(read.manifest).toEqual(manifest);
    const bytes = read.files.get(`${hashTemplate(text)}.txt`);
    expect(bytes?.toString('utf8')).toBe(text);
    // Deterministic: a trailing newline, two-space indent.
    expect(readFileSync(join(dir, MANIFEST_FILE), 'utf8')).toBe(
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  });

  it('never overwrites a published file', () => {
    const { manifest, newTexts } = addTemplates(emptyManifest(), [
      { name: 'a', version: 1, templateText: 'alpha' },
    ]);
    writeRecord(dir, manifest, newTexts);
    expect(() => writeRecord(dir, manifest, newTexts)).toThrow(/EEXIST/);
  });

  it('surfaces a manifest it cannot parse rather than starting over', () => {
    writeFileSync(join(dir, MANIFEST_FILE), '{ not json');
    expect(() => readRecord(dir)).toThrow(SyntaxError);
  });

  it('reads every file in the templates directory', () => {
    writeRecord(dir, emptyManifest(), new Map([['ab', 'x']]));
    expect([...readRecord(dir).files.keys()]).toEqual(['ab.txt']);
    expect(TEMPLATES_DIR).toBe('templates');
  });
});

describe('toSeedTemplates', () => {
  it('reads an omitted version as 1, the Prisma default', () => {
    expect(
      toSeedTemplates([
        { name: 'a', templateText: 'x' },
        { name: 'b', templateText: 'y', version: 3 },
      ]),
    ).toEqual([
      { name: 'a', version: 1, templateText: 'x' },
      { name: 'b', version: 3, templateText: 'y' },
    ]);
  });
});
