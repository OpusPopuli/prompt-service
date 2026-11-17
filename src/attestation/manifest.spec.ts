import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  addTemplates,
  ambiguousLabels,
  emptyManifest,
  GRANDFATHERED_LABELS,
  hashTemplate,
  Manifest,
  normalize,
  SeedTemplate,
  verifyAppendOnly,
  verifyManifest,
} from './manifest';
import { readRecord } from './record-io';

const tpl = (name: string, version: number, templateText: string) => ({
  name,
  version,
  templateText,
});

/** Files exactly as `writeRecord` would lay them out for `texts`. */
function filesFor(texts: string[]): Map<string, Buffer> {
  return new Map(
    texts.map((t) => [`${hashTemplate(t)}.txt`, Buffer.from(t, 'utf8')]),
  );
}

/** A record as the real one is shaped: the frozen list already in place. */
function publish(templates: SeedTemplate[]): Manifest {
  const result = addTemplates(
    { ...emptyManifest(), grandfatheredLabels: [...GRANDFATHERED_LABELS] },
    templates,
  );
  expect(result.conflicts).toEqual([]);
  return result.manifest;
}

describe('hashTemplate', () => {
  it('is sha256 hex of the UTF-8 text — the hash prompt-client stores', () => {
    // Standard sha256 test vector, pinned so the algorithm cannot drift.
    expect(hashTemplate('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    // Non-ASCII: the hash is of the UTF-8 bytes, which is what the file holds.
    const text = 'naïve — “quoted”';
    expect(hashTemplate(text)).toBe(
      createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'),
    );
  });
});

describe('addTemplates', () => {
  it('publishes each new text once, with its byte length', () => {
    const result = addTemplates(emptyManifest(), [
      tpl('a', 1, 'alpha'),
      tpl('b', 1, 'naïve'),
    ]);
    expect(result.conflicts).toEqual([]);
    expect([...result.newTexts.values()].sort()).toEqual(['alpha', 'naïve']);
    const b = result.manifest.entries.find(
      (e) => e.hash === hashTemplate('naïve'),
    );
    expect(b?.bytes).toBe(6); // ï is two bytes
  });

  it('is a no-op for templates already published under their label', () => {
    const manifest = publish([tpl('a', 1, 'alpha')]);
    const again = addTemplates(manifest, [tpl('a', 1, 'alpha')]);
    expect(again.newTexts.size).toBe(0);
    expect(again.manifest).toEqual(manifest);
  });

  it('records a promotion — same text, new label — as an alias, not a new text', () => {
    const manifest = publish([tpl('a-quoted', 1, 'same')]);
    const result = addTemplates(manifest, [tpl('a', 2, 'same')]);
    expect(result.conflicts).toEqual([]);
    expect(result.newTexts.size).toBe(0);
    expect(result.manifest.entries).toHaveLength(1);
    expect(result.manifest.entries[0].labels).toEqual([
      { name: 'a', version: 2 },
      { name: 'a-quoted', version: 1 },
    ]);
  });

  it('refuses new text under a published label: the version was not bumped', () => {
    const manifest = publish([tpl('a', 1, 'alpha')]);
    const result = addTemplates(manifest, [tpl('a', 1, 'alpha, edited')]);
    expect(result.conflicts).toEqual([
      'a@v1 is already published with different text — bump its `version` in prisma/seed.ts',
    ]);
    expect(result.newTexts.size).toBe(0);
    expect(result.manifest).toEqual(manifest);
  });

  it('refuses an alias that would make a label name a second text', () => {
    const manifest = publish([tpl('a', 1, 'alpha'), tpl('b', 1, 'beta')]);
    const result = addTemplates(manifest, [tpl('a', 1, 'beta')]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.manifest).toEqual(manifest);
  });

  it('accepts the revision once the version is bumped, keeping the old text', () => {
    const manifest = publish([tpl('a', 1, 'alpha')]);
    const result = addTemplates(manifest, [tpl('a', 2, 'alpha, edited')]);
    expect(result.conflicts).toEqual([]);
    expect(result.manifest.entries.map((e) => e.labels)).toEqual(
      expect.arrayContaining([
        [{ name: 'a', version: 1 }],
        [{ name: 'a', version: 2 }],
      ]),
    );
  });

  it('lets a backfill record history that edited without a bump', () => {
    const manifest = publish([tpl('a', 1, 'alpha')]);
    const result = addTemplates(manifest, [tpl('a', 1, 'alpha, edited')], {
      allowNewAmbiguity: true,
    });
    expect(result.conflicts).toEqual([]);
    expect(ambiguousLabels(result.manifest)).toEqual([
      { name: 'a', version: 1 },
    ]);
  });

  it('does not mutate the manifest it was given', () => {
    const manifest = publish([tpl('a-quoted', 1, 'same')]);
    const before = JSON.stringify(manifest);
    addTemplates(manifest, [tpl('a', 2, 'same'), tpl('c', 1, 'gamma')]);
    expect(JSON.stringify(manifest)).toBe(before);
  });
});

describe('normalize', () => {
  it('orders entries by hash and labels by name then version', () => {
    const manifest = normalize({
      ...emptyManifest(),
      grandfatheredLabels: [
        { name: 'b', version: 1 },
        { name: 'a', version: 1 },
      ],
      entries: [
        { hash: 'ff', bytes: 1, labels: [{ name: 'z', version: 1 }] },
        {
          hash: '00',
          bytes: 1,
          labels: [
            { name: 'a', version: 10 },
            { name: 'a', version: 2 },
          ],
        },
      ],
    });
    expect(manifest.entries.map((e) => e.hash)).toEqual(['00', 'ff']);
    expect(manifest.entries[0].labels.map((l) => l.version)).toEqual([2, 10]);
    expect(manifest.grandfatheredLabels.map((l) => l.name)).toEqual(['a', 'b']);
  });
});

describe('verifyManifest', () => {
  const seeded = [tpl('a', 1, 'alpha'), tpl('b', 1, 'beta')];
  const manifest = publish(seeded);
  const files = filesFor(['alpha', 'beta']);

  it('passes a complete, untampered record', () => {
    expect(verifyManifest(manifest, files, seeded)).toEqual([]);
  });

  it('catches a file whose contents no longer hash to its name', () => {
    const tampered = new Map(files);
    tampered.set(`${hashTemplate('alpha')}.txt`, Buffer.from('alphA'));
    expect(verifyManifest(manifest, tampered, seeded)).toEqual(
      expect.arrayContaining([expect.stringContaining('contents hash to')]),
    );
  });

  it('catches a line-ending rewrite, which changes the bytes but not the meaning', () => {
    const seededCrlf = [tpl('c', 1, 'line one\nline two\n')];
    const crlfManifest = publish(seededCrlf);
    const rewritten = new Map([
      [
        `${hashTemplate('line one\nline two\n')}.txt`,
        Buffer.from('line one\r\nline two\r\n'),
      ],
    ]);
    expect(verifyManifest(crlfManifest, rewritten, seededCrlf)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('contents hash to'),
        expect.stringContaining('bytes'),
      ]),
    );
  });

  it('catches a deleted template file', () => {
    const missing = new Map(files);
    missing.delete(`${hashTemplate('beta')}.txt`);
    expect(verifyManifest(manifest, missing, seeded)).toEqual([
      `${hashTemplate('beta')}: manifest entry has no template file`,
    ]);
  });

  it('catches a file with no entry, and a stray file name', () => {
    const extra = new Map(files);
    extra.set(`${hashTemplate('orphan')}.txt`, Buffer.from('orphan'));
    extra.set('notes.md', Buffer.from('x'));
    expect(verifyManifest(manifest, extra, seeded)).toEqual(
      expect.arrayContaining([
        `${hashTemplate('orphan')}.txt: no manifest entry`,
        'unexpected file attestation/templates/notes.md',
      ]),
    );
  });

  it('catches a seeded template that was never published', () => {
    const now = [...seeded, tpl('c', 1, 'gamma')];
    expect(verifyManifest(manifest, files, now)).toEqual([
      'c@v1 is not published — run `pnpm attestation:generate`',
    ]);
  });

  it('catches published text that lacks its current label', () => {
    const renamed = [tpl('a2', 1, 'alpha'), tpl('b', 1, 'beta')];
    expect(verifyManifest(manifest, files, renamed)).toEqual([
      'a2@v1: text is published but not under this label — run `pnpm attestation:generate`',
    ]);
  });

  it('catches a label naming two texts', () => {
    const { manifest: ambiguous } = addTemplates(
      manifest,
      [tpl('a', 1, 'alpha, edited')],
      { allowNewAmbiguity: true },
    );
    const bothFiles = filesFor(['alpha', 'alpha, edited', 'beta']);
    expect(verifyManifest(ambiguous, bothFiles, seeded)).toEqual([
      'a@v1 names more than one text — bump the version',
    ]);
  });

  it('allows history only for the labels pinned in code', () => {
    const seededRag = [tpl('rag', 1, 'rag one')];
    const { manifest: ambiguous } = addTemplates(
      publish(seededRag),
      [tpl('rag', 1, 'rag two')],
      { allowNewAmbiguity: true },
    );
    expect(
      verifyManifest(ambiguous, filesFor(['rag one', 'rag two']), seededRag),
    ).toEqual([]);
  });

  it('refuses a grandfathered list extended to excuse a new ambiguity', () => {
    const { manifest: ambiguous } = addTemplates(
      manifest,
      [tpl('a', 1, 'alpha, edited')],
      { allowNewAmbiguity: true },
    );
    const excused = {
      ...ambiguous,
      grandfatheredLabels: [
        ...ambiguous.grandfatheredLabels,
        { name: 'a', version: 1 },
      ],
    };
    expect(
      verifyManifest(
        excused,
        filesFor(['alpha', 'alpha, edited', 'beta']),
        seeded,
      ),
    ).toEqual([
      'a@v1 names more than one text — bump the version',
      'grandfatheredLabels differs from GRANDFATHERED_LABELS — the list is frozen',
    ]);
  });

  it('refuses a schema it does not understand', () => {
    expect(
      verifyManifest({ ...manifest, schemaVersion: 2 }, files, seeded),
    ).toEqual(['unsupported schemaVersion 2']);
  });

  it('refuses another hash algorithm and a malformed hash', () => {
    const bad = {
      ...manifest,
      hashAlgorithm: 'md5' as unknown as 'sha256',
      entries: [
        ...manifest.entries,
        { hash: '../../etc', bytes: 1, labels: [] },
      ],
    };
    expect(verifyManifest(bad, files, seeded)).toEqual(
      expect.arrayContaining([
        'unsupported hashAlgorithm md5',
        'malformed hash "../../etc"',
      ]),
    );
  });
});

describe('verifyAppendOnly', () => {
  const base = publish([tpl('a', 1, 'alpha'), tpl('b', 1, 'beta')]);

  it('accepts additions: new texts and new labels', () => {
    const { manifest: grown } = addTemplates(base, [
      tpl('a', 2, 'alpha two'),
      tpl('b-renamed', 1, 'beta'),
    ]);
    expect(verifyAppendOnly(base, grown)).toEqual([]);
  });

  it('catches an entry deleted together with its file', () => {
    const shrunk = {
      ...base,
      entries: base.entries.filter((e) => e.hash !== hashTemplate('beta')),
    };
    expect(verifyAppendOnly(base, shrunk)).toEqual([
      `${hashTemplate('beta')}: removed — the record is append-only`,
    ]);
  });

  it('catches a label taken off a published text', () => {
    const relabelled = {
      ...base,
      entries: base.entries.map((e) =>
        e.hash === hashTemplate('alpha')
          ? { ...e, labels: [{ name: 'other', version: 1 }] }
          : e,
      ),
    };
    expect(verifyAppendOnly(base, relabelled)).toEqual([
      `${hashTemplate('alpha')}: label a@v1 removed`,
    ]);
  });
});

describe('GRANDFATHERED_LABELS', () => {
  it('is exactly what the backfill found ambiguous in history', () => {
    // The real record: if these ever differ, someone edited one side.
    const record = readRecord(join(__dirname, '..', '..', 'attestation'));
    expect(ambiguousLabels(record.manifest)).toEqual(
      [...GRANDFATHERED_LABELS].sort(
        (a, b) => a.name.localeCompare(b.name) || a.version - b.version,
      ),
    );
  });
});
