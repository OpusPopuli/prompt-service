import { createHash } from 'node:crypto';

import {
  CANONICAL_PROPOSITION_ANALYSIS,
  OFFSETS_EXAMPLE,
  OFFSETS_RULE,
  OFFSETS_SELFCHECK,
  QUOTED_EXAMPLE,
  QUOTED_RULE,
  QUOTED_SELFCHECK,
  deriveQuotedClaimsContract,
  prompts,
} from '../../prisma/seed';

const QUOTED_NAME = `${CANONICAL_PROPOSITION_ANALYSIS}-quoted`;

const sha256 = (text: string): string =>
  createHash('sha256').update(text).digest('hex');

const byName = (name: string) => {
  const found = prompts.find((p) => p.name === name);
  if (!found) throw new Error(`template ${name} not seeded`);
  return found;
};

describe('proposition-analysis claim contracts (#1212)', () => {
  const canonical = byName(CANONICAL_PROPOSITION_ANALYSIS);
  const quoted = byName(QUOTED_NAME);

  describe('the canonical template', () => {
    // templateHash is sha256(templateText) and drives staleness-triggered
    // regeneration of every stored analysis. Adding the quoted variant must
    // not move it. This is also the exact hash #1212's recorded 2%/9%
    // baselines were measured against, so changing it invalidates them.
    it('has not changed hash while the variant was added', () => {
      expect(sha256(canonical.templateText)).toBe(
        '850bdd19629b0896b7d3079770050b5e093ddf20d1c838572455474dc81f9df0',
      );
    });

    it('still asks for character offsets', () => {
      expect(canonical.templateText).toContain(OFFSETS_RULE);
      expect(canonical.templateText).toContain(OFFSETS_EXAMPLE);
      expect(canonical.templateText).toContain(OFFSETS_SELFCHECK);
    });
  });

  describe('the quoted variant', () => {
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
      // ...and the canonical one still has the bare form, so this is a real
      // difference the derivation makes rather than a property of both.
      expect(canonical.templateText).toMatch(
        /\u25A1 Offsets are into the raw FullText only/,
      );
    });

    it('self-checks that the quote is actually findable', () => {
      expect(quoted.templateText).toContain(
        'Every sourceQuote is copied verbatim from FullText',
      );
    });

    it('is seeded under its own name, leaving production untouched', () => {
      expect(quoted.name).toBe(QUOTED_NAME);
      expect(quoted.name).not.toBe(canonical.name);
      expect(quoted.variables).toEqual(canonical.variables);
      expect(quoted.category).toBe(canonical.category);
    });

    // The S2 decision gate compares these two prompts to judge the contract.
    // If they differ anywhere else, the comparison measures that difference
    // too and the gate's verdict is not about the contract at all.
    it('differs from the canonical template ONLY in the claims contract', () => {
      const neutralise = (text: string): string =>
        text
          .replace(OFFSETS_RULE, '<<CLAIMS_RULE>>')
          .replace(QUOTED_RULE, '<<CLAIMS_RULE>>')
          .replace(OFFSETS_EXAMPLE, '<<CLAIMS_EXAMPLE>>')
          .replace(QUOTED_EXAMPLE, '<<CLAIMS_EXAMPLE>>')
          .replace(OFFSETS_SELFCHECK, '<<CLAIMS_SELFCHECK>>')
          .replace(QUOTED_SELFCHECK, '<<CLAIMS_SELFCHECK>>');

      expect(neutralise(quoted.templateText)).toBe(
        neutralise(canonical.templateText),
      );
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
      const out = deriveQuotedClaimsContract(canonical.templateText);
      expect(out).toContain(QUOTED_RULE);
      expect(out).toContain(QUOTED_EXAMPLE);
      expect(out).not.toContain(OFFSETS_RULE);
      expect(out).not.toContain(OFFSETS_EXAMPLE);
    });
  });
});
