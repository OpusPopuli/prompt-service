import { createHash } from 'node:crypto';

import {
  CANONICAL_PROPOSITION_ANALYSIS,
  CANONICAL_PROPOSITION_ANALYSIS_V1_TEXT as V1_TEXT,
  OFFSETS_EXAMPLE,
  OFFSETS_RULE,
  OFFSETS_SELFCHECK,
  QUOTED_EXAMPLE,
  QUOTED_RULE,
  QUOTED_SELFCHECK,
  deriveQuotedClaimsContract,
  prompts,
} from '../../prisma/seed';

const sha256 = (text: string): string =>
  createHash('sha256').update(text).digest('hex');

const byName = (name: string) => {
  const found = prompts.find((p) => p.name === name);
  if (!found) throw new Error(`template ${name} not seeded`);
  return found;
};

/** The canonical hash before promotion — what every stored analysis cites. */
const V1_HASH =
  '850bdd19629b0896b7d3079770050b5e093ddf20d1c838572455474dc81f9df0';

/** The hash the `-quoted` variant served, byte-for-byte, before promotion. */
const V2_HASH =
  'ac0e63ebe039773a78964b032a0970d2d1cedc78ce453bc6febf5afb762b997d';

describe('proposition-analysis claim contracts (#1212)', () => {
  const canonical = byName(CANONICAL_PROPOSITION_ANALYSIS);
  const quoted = canonical;

  describe('the canonical template, promoted to v2', () => {
    // templateHash is sha256(templateText) and drives staleness-triggered
    // regeneration of every stored analysis. Promotion MOVES it on purpose —
    // that is the cutover mechanism, not a side effect: every stored analysis
    // cites V1_HASH, so moving the live hash marks all of them stale and the
    // next generateMissing regenerates them under the new contract.
    it('serves the quoted contract, moving the hash off v1', () => {
      expect(sha256(canonical.templateText)).not.toBe(V1_HASH);
      expect(sha256(canonical.templateText)).toBe(V2_HASH);
    });

    // Promotion must change WHICH NAME serves the text, never the text. This
    // pins it to the bytes that were reviewed and merged under the `-quoted`
    // name, so the promotion cannot smuggle in an edit.
    it('serves exactly the bytes the -quoted variant was measured as', () => {
      expect(sha256(deriveQuotedClaimsContract(V1_TEXT))).toBe(V2_HASH);
      expect(canonical.templateText).toBe(deriveQuotedClaimsContract(V1_TEXT));
    });

    it('is version 2', () => {
      expect(canonical.version).toBe(2);
    });

    // The version-history row records WHY a version exists. Every row
    // defaulted to "Initial seed", which for a promoted version is false —
    // and this is the one table whose job is letting a reader trace an output
    // back to its prompt and see what changed (#1143).
    it('records why v2 exists, not that it was seeded fresh', () => {
      expect(canonical.changeNote).toBeDefined();
      expect(canonical.changeNote).not.toBe('Initial seed');
      expect(canonical.changeNote).toMatch(/promoted/i);
    });

    it('no longer asks for character offsets', () => {
      expect(canonical.templateText).not.toContain(OFFSETS_RULE);
      expect(canonical.templateText).not.toContain(OFFSETS_EXAMPLE);
      expect(canonical.templateText).not.toContain(OFFSETS_SELFCHECK);
    });

    // A template has exactly one row — `name` is unique — so two names would
    // have meant two lineages and two hashes for one prompt, against the
    // single attestation chain of #1143.
    it('is the only proposition-analysis template seeded', () => {
      const matching = prompts.filter((p) =>
        p.name.startsWith(CANONICAL_PROPOSITION_ANALYSIS),
      );
      expect(matching.map((p) => p.name)).toEqual([
        CANONICAL_PROPOSITION_ANALYSIS,
      ]);
    });
  });

  describe('the quoted contract now being served', () => {
    it('asks for a verbatim quote and never for offsets', () => {
      expect(quoted.templateText).toContain('sourceQuote');
      expect(quoted.templateText).not.toMatch(/sourceStart|sourceEnd/);
    });

    // The sectioning contract still uses offsets and legitimately keeps them
    // (analysisSections is untouched by #1212). What must not survive is the
    // self-check's BARE "Offsets are into the raw FullText" line: it sits a few
    // lines after "Do NOT emit character offsets", so an unscoped version reads
    // as asking the model to verify the very offsets it was told not to emit.
    it('scopes the self-check offset item to sections', () => {
      expect(quoted.templateText).toContain(
        'Section offsets are into the raw FullText only',
      );
      expect(quoted.templateText).not.toMatch(
        /\u25A1 Offsets are into the raw FullText only/,
      );
      // ...and v1 had the bare form, so this is a real difference the
      // promotion makes rather than a property both contracts shared. Was
      // asserted against `canonical` before promotion; canonical IS the
      // quoted contract now, so v1 is what it must be compared against.
      expect(V1_TEXT).toMatch(/\u25A1 Offsets are into the raw FullText only/);
    });

    it('self-checks that the quote is actually findable', () => {
      expect(quoted.templateText).toContain(
        'Every sourceQuote is copied verbatim from FullText',
      );
    });

    it('is served under the canonical name, so production gets it', () => {
      // Before promotion this asserted the opposite — that the quoted
      // contract sat under its own name and left production untouched. That
      // was the point while it was being measured, and reversing it is the
      // promotion.
      expect(quoted.name).toBe(CANONICAL_PROPOSITION_ANALYSIS);
      expect(prompts.some((p) => p.name.endsWith('-quoted'))).toBe(false);
    });

    // Promotion must change the claims contract and NOTHING else. Anything
    // else that moved would ride along into a regeneration of the entire
    // corpus, attributed to a change nobody reviewed.
    it('differs from v1 ONLY in the claims contract', () => {
      const neutralise = (text: string): string =>
        text
          .replace(OFFSETS_RULE, '<<CLAIMS_RULE>>')
          .replace(QUOTED_RULE, '<<CLAIMS_RULE>>')
          .replace(OFFSETS_EXAMPLE, '<<CLAIMS_EXAMPLE>>')
          .replace(QUOTED_EXAMPLE, '<<CLAIMS_EXAMPLE>>')
          .replace(OFFSETS_SELFCHECK, '<<CLAIMS_SELFCHECK>>')
          .replace(QUOTED_SELFCHECK, '<<CLAIMS_SELFCHECK>>');

      expect(neutralise(canonical.templateText)).toBe(neutralise(V1_TEXT));
    });
  });

  describe('deriveQuotedClaimsContract', () => {
    it('fails loudly when the canonical blocks no longer match', () => {
      // A silent no-op here would ship a variant that still asks for offsets
      // while being measured as quote-then-locate — a false negative on S2,
      // and the one result that would wrongly force the segment-id fallback.
      expect(() => deriveQuotedClaimsContract('unrelated text')).toThrow(
        /cannot derive the quoted proposition-analysis template/,
      );
    });

    it('replaces both the rule and the worked example', () => {
      // From v1: the canonical text is already derived, so passing it back
      // in would correctly trip the guard rather than test the replacement.
      const out = deriveQuotedClaimsContract(V1_TEXT);
      expect(out).toContain(QUOTED_RULE);
      expect(out).toContain(QUOTED_EXAMPLE);
      expect(out).not.toContain(OFFSETS_RULE);
      expect(out).not.toContain(OFFSETS_EXAMPLE);
    });
  });
});
