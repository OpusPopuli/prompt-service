import { createHash } from 'node:crypto';

/**
 * The public prompt attestation record (opuspopuli#1450).
 *
 * Every AI output in Opus Populi stores the sha256 of the bare template text
 * that produced it (`promptHash`). This record maps each such hash to the
 * exact published text, so a reader can go from a sentence on a page to the
 * prompt behind it and check the hash themselves:
 *
 *   attestation/templates/<sha256>.txt   the exact template bytes
 *   attestation/manifest.json            hash -> name/version labels
 *
 * A file is named by the hash of its own contents, so a tampered or
 * re-encoded file is detectable by anyone with `shasum`, not only by CI.
 *
 * The record is append-only. A text, once published, keeps its file: outputs
 * produced from it stay attributable after the template is revised.
 *
 * Pure functions only — no file or git access — so the rules are unit-tested
 * here and the CLI (`scripts/prompt-manifest.ts`) only does I/O.
 */

export const MANIFEST_SCHEMA_VERSION = 1;

export interface TemplateLabel {
  name: string;
  version: number;
}

export interface SeedTemplate extends TemplateLabel {
  templateText: string;
}

export interface ManifestEntry {
  hash: string;
  bytes: number;
  labels: TemplateLabel[];
}

export interface Manifest {
  schemaVersion: number;
  hashAlgorithm: 'sha256';
  /**
   * Labels that carried more than one text before this record existed: the
   * template was edited without its version being bumped. Recorded so the
   * ambiguity is visible rather than hidden, and frozen — no label may join
   * this list. It is exactly why outputs are attributed by hash, not version.
   */
  grandfatheredLabels: TemplateLabel[];
  entries: ManifestEntry[];
}

export const TEMPLATE_FILE_PATTERN = /^([0-9a-f]{64})\.txt$/;

/** Same function as `@opuspopuli/prompt-client` and the seed's `templateHash`. */
export function hashTemplate(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function emptyManifest(): Manifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    hashAlgorithm: 'sha256',
    grandfatheredLabels: [],
    entries: [],
  };
}

export function labelKey(label: TemplateLabel): string {
  return `${label.name}@v${label.version}`;
}

function compareLabels(a: TemplateLabel, b: TemplateLabel): number {
  return a.name.localeCompare(b.name) || a.version - b.version;
}

/** Each label mapped to every hash published under it. */
export function hashesByLabel(manifest: Manifest): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const entry of manifest.entries) {
    for (const label of entry.labels) {
      const key = labelKey(label);
      const hashes = index.get(key) ?? new Set<string>();
      hashes.add(entry.hash);
      index.set(key, hashes);
    }
  }
  return index;
}

/** Deterministic order, so regenerating an unchanged record changes no byte. */
export function normalize(manifest: Manifest): Manifest {
  return {
    schemaVersion: manifest.schemaVersion,
    hashAlgorithm: manifest.hashAlgorithm,
    grandfatheredLabels: [...manifest.grandfatheredLabels].sort(compareLabels),
    entries: manifest.entries
      .map((e) => ({ ...e, labels: [...e.labels].sort(compareLabels) }))
      .sort((a, b) => a.hash.localeCompare(b.hash)),
  };
}

export interface AddResult {
  manifest: Manifest;
  /** Texts not previously published, keyed by hash — the files to write. */
  newTexts: Map<string, string>;
  /** Refusals: a label that would come to name a second text. */
  conflicts: string[];
}

interface AddOptions {
  /** Backfill only: history already contains edits made without a bump. */
  allowNewAmbiguity: boolean;
}

/**
 * Publish `templates` into `manifest`. Never removes or rewrites an entry.
 *
 * Refuses (unless backfilling) to let a label name a second text: that is a
 * template edited without bumping `version`, which makes "v1" ambiguous to
 * every reader of an output's receipt.
 */
export function addTemplates(
  manifest: Manifest,
  templates: SeedTemplate[],
  options: AddOptions = { allowNewAmbiguity: false },
): AddResult {
  const entries = new Map(
    manifest.entries.map((e) => [e.hash, { ...e, labels: [...e.labels] }]),
  );
  const labels = hashesByLabel(manifest);
  const newTexts = new Map<string, string>();
  const conflicts: string[] = [];

  for (const template of templates) {
    const hash = hashTemplate(template.templateText);
    const label = { name: template.name, version: template.version };
    const key = labelKey(label);
    const published = labels.get(key) ?? new Set<string>();

    if (published.has(hash)) continue;
    if (published.size > 0 && !options.allowNewAmbiguity) {
      conflicts.push(
        `${key} is already published with different text — ` +
          `bump its \`version\` in prisma/seed.ts`,
      );
      continue;
    }

    const entry = entries.get(hash);
    if (entry) {
      entry.labels.push(label);
    } else {
      entries.set(hash, {
        hash,
        bytes: Buffer.byteLength(template.templateText, 'utf8'),
        labels: [label],
      });
      newTexts.set(hash, template.templateText);
    }
    labels.set(key, published.add(hash));
  }

  return {
    manifest: normalize({ ...manifest, entries: [...entries.values()] }),
    newTexts,
    conflicts,
  };
}

/** The labels that name more than one text. */
export function ambiguousLabels(manifest: Manifest): TemplateLabel[] {
  const ambiguous: TemplateLabel[] = [];
  for (const [key, hashes] of hashesByLabel(manifest)) {
    if (hashes.size < 2) continue;
    const at = key.lastIndexOf('@v');
    ambiguous.push({
      name: key.slice(0, at),
      version: Number(key.slice(at + 2)),
    });
  }
  return ambiguous.sort(compareLabels);
}

function checkFiles(manifest: Manifest, files: Map<string, Buffer>): string[] {
  const problems: string[] = [];
  const byHash = new Map(manifest.entries.map((e) => [e.hash, e]));

  for (const [name, bytes] of files) {
    const match = TEMPLATE_FILE_PATTERN.exec(name);
    if (!match) {
      problems.push(`unexpected file attestation/templates/${name}`);
      continue;
    }
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== match[1]) {
      problems.push(`${name}: contents hash to ${actual}, not its name`);
    }
    if (!byHash.has(match[1])) {
      problems.push(`${name}: no manifest entry`);
    }
  }

  for (const entry of manifest.entries) {
    const bytes = files.get(`${entry.hash}.txt`);
    if (!bytes) {
      problems.push(`${entry.hash}: manifest entry has no template file`);
    } else if (bytes.length !== entry.bytes) {
      problems.push(
        `${entry.hash}: manifest says ${entry.bytes} bytes, file has ${bytes.length}`,
      );
    }
  }
  return problems;
}

/**
 * The labels history left ambiguous, pinned HERE rather than trusted from the
 * manifest: a list read from the file under test could be extended by the
 * same edit that sneaks a second text under an old label.
 */
export const GRANDFATHERED_LABELS: readonly TemplateLabel[] = [
  { name: 'bill-extraction', version: 1 },
  { name: 'civics-extraction', version: 1 },
  { name: 'civics-extraction-compact', version: 1 },
  { name: 'document-analysis-base-instructions', version: 1 },
  { name: 'document-analysis-contract', version: 1 },
  { name: 'document-analysis-form', version: 1 },
  { name: 'document-analysis-generic', version: 1 },
  { name: 'document-analysis-petition', version: 1 },
  { name: 'document-analysis-proposition', version: 1 },
  { name: 'document-analysis-proposition-analysis', version: 1 },
  { name: 'document-analysis-representative-bio', version: 1 },
  { name: 'rag', version: 1 },
  { name: 'structural-analysis', version: 1 },
  { name: 'structural-schema-representatives', version: 1 },
];

function checkLabels(manifest: Manifest): string[] {
  const pinned = new Set(GRANDFATHERED_LABELS.map(labelKey));
  const problems = ambiguousLabels(manifest)
    .map(labelKey)
    .filter((key) => !pinned.has(key))
    .map((key) => `${key} names more than one text — bump the version`);

  const listed = new Set(manifest.grandfatheredLabels.map(labelKey));
  const same =
    listed.size === pinned.size && [...listed].every((k) => pinned.has(k));
  if (!same) {
    problems.push(
      'grandfatheredLabels differs from GRANDFATHERED_LABELS — the list is frozen',
    );
  }
  return problems;
}

function checkHeader(manifest: Manifest): string[] {
  const problems: string[] = [];
  if (manifest.hashAlgorithm !== 'sha256') {
    problems.push(
      `unsupported hashAlgorithm ${String(manifest.hashAlgorithm)}`,
    );
  }
  for (const entry of manifest.entries) {
    if (!/^[0-9a-f]{64}$/.test(entry.hash)) {
      problems.push(`malformed hash ${JSON.stringify(entry.hash)}`);
    }
  }
  return problems;
}

function checkCoverage(
  manifest: Manifest,
  templates: SeedTemplate[],
): string[] {
  const byHash = new Map(manifest.entries.map((e) => [e.hash, e]));
  const problems: string[] = [];
  for (const template of templates) {
    const key = labelKey(template);
    const entry = byHash.get(hashTemplate(template.templateText));
    if (!entry) {
      problems.push(
        `${key} is not published — run \`pnpm attestation:generate\``,
      );
    } else if (!entry.labels.some((l) => labelKey(l) === key)) {
      problems.push(
        `${key}: text is published but not under this label — ` +
          `run \`pnpm attestation:generate\``,
      );
    }
  }
  return problems;
}

/**
 * Everything wrong with the record, or an empty list.
 *
 * `files` is the contents of `attestation/templates/`, keyed by file name;
 * `templates` is what `prisma/seed.ts` seeds today.
 */
export function verifyManifest(
  manifest: Manifest,
  files: Map<string, Buffer>,
  templates: SeedTemplate[],
): string[] {
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    return [`unsupported schemaVersion ${manifest.schemaVersion}`];
  }
  return [
    ...checkHeader(manifest),
    ...checkFiles(manifest, files),
    ...checkLabels(manifest),
    ...checkCoverage(manifest, templates),
  ];
}

/**
 * What `current` dropped or rewrote from `base` — the append-only rule.
 *
 * `verifyManifest` sees only one version of the record, so deleting an entry
 * together with its file passes it. This compares against the version the
 * change started from (CI: the pull request's base). An entry's bytes cannot
 * change while its hash stays — the file name is the hash — so a present,
 * verified entry with the same labels is an unchanged one.
 */
export function verifyAppendOnly(base: Manifest, current: Manifest): string[] {
  const now = new Map(current.entries.map((e) => [e.hash, e]));
  const problems: string[] = [];
  for (const before of base.entries) {
    const after = now.get(before.hash);
    if (!after) {
      problems.push(`${before.hash}: removed — the record is append-only`);
      continue;
    }
    const kept = new Set(after.labels.map(labelKey));
    for (const label of before.labels) {
      if (!kept.has(labelKey(label))) {
        problems.push(`${before.hash}: label ${labelKey(label)} removed`);
      }
    }
  }
  return problems;
}
