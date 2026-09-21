import { createHash } from 'node:crypto';

import {
  CANONICAL_PROPOSITION_ANALYSIS,
  CANONICAL_PROPOSITION_ANALYSIS_OFFSETS_TEXT as OFFSETS_TEXT,
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

/** v1 — the offsets contract, and what every stored analysis still cites. */
const V1_HASH =
  '850bdd19629b0896b7d3079770050b5e093ddf20d1c838572455474dc81f9df0';

/**
 * v2 — the hash the `-quoted` variant served, and **the exact bytes the
 * anchoring eval measured**: 57% on `olmo-3.1:32b-instruct`, 28% on
 * `olmo-3:7b-instruct`. Kept because those figures belong to this text, not
 * to whatever the canonical name serves today.
 */
const V2_HASH =
  'ac0e63ebe039773a78964b032a0970d2d1cedc78ce453bc6febf5afb762b997d';

/** v3 — adds the yes/no symmetry rule (#114). */
const V3_HASH =
  'd62e7b0a144bafa1192fbb5c059f31250052b50b572c05c3d839bc98acde3cb7';

describe('proposition-analysis claim contracts (#1212)', () => {
  const canonical = byName(CANONICAL_PROPOSITION_ANALYSIS);
  const quoted = canonical;

  describe('the canonical template', () => {
    // templateHash is sha256(templateText) and drives staleness-triggered
    // regeneration of every stored analysis. Promotion MOVES it on purpose —
    // that is the cutover mechanism, not a side effect: every stored analysis
    // cites V1_HASH, so moving the live hash marks all of them stale and the
    // next generateMissing regenerates them under the new contract.
    it('serves the quoted contract, moving the hash off v1', () => {
      expect(sha256(canonical.templateText)).not.toBe(V1_HASH);
      expect(sha256(canonical.templateText)).toBe(V3_HASH);
    });

    // Stated as an assertion rather than left implicit: the anchoring figures
    // (57% / 28%) were measured against V2_HASH, and v3 is not those bytes.
    // The claims contract is unchanged — the next test pins that — so the
    // numbers should carry, but "should" is not "measured", and the next
    // generation run is what re-measures them.
    it('is no longer the exact text the anchoring eval measured', () => {
      expect(sha256(canonical.templateText)).not.toBe(V2_HASH);
    });

    it('is version 3', () => {
      expect(canonical.version).toBe(3);
    });

    // v3 changes how the two OUTCOMES are written. It must not touch the
    // claims contract — that is what the anchoring numbers were measured on,
    // and quietly altering it would make them describe a prompt that no
    // longer exists while still being quoted as current.
    it('leaves the claims contract exactly as v2 measured it', () => {
      expect(canonical.templateText).toContain(QUOTED_RULE);
      expect(canonical.templateText).toContain(QUOTED_EXAMPLE);
      expect(canonical.templateText).toContain(QUOTED_SELFCHECK);
    });

    // #114. The symmetry eval measured "yes" running longer than "no" on the
    // same 8 of 10 measures for TWO unrelated model families, which points at
    // the prompt rather than the model — and the cause was in the schema: one
    // field asked for a "concrete change", the other for the "status quo".
    // Those are not symmetric tasks.
    describe('yes/no outcome symmetry (#114)', () => {
      it('instructs the two outcomes to be comparable', () => {
        expect(canonical.templateText).toContain('RULE 3a: SYMMETRY');
        expect(canonical.templateText).toMatch(
          /comparable length and comparable specificity/,
        );
      });

      it('asks noOutcome for what CONTINUES, not for the status quo', () => {
        // Anchored on the FIELD HINT, not on the first mention of the field:
        // RULE 3a names both outcomes too, and slicing from there measured
        // the rule rather than the schema.
        const at = canonical.templateText.indexOf(
          '"noOutcome": "A no vote means',
        );
        expect(at).toBeGreaterThan(-1);
        const hint = canonical.templateText.slice(at, at + 260);

        // "the status quo" is exactly the instruction that produced a terse
        // no case: it asks the model to note that things stay the same
        // rather than to say what specifically stays.
        expect(hint).toMatch(/CONTINUES/);
        expect(hint).not.toMatch(/\[status quo\]/);
      });

      it('pairs a quantified yes with a quantified no in its own example', () => {
        // The worked examples teach more than the instruction does. Both
        // sides now carry the figure, so "rises to $18" cannot sit beside a
        // bare "no change".
        const from = canonical.templateText.indexOf(
          '"yesOutcome": "A yes vote means',
        );
        const to = canonical.templateText.indexOf(
          '"noOutcome": "A no vote means',
        );
        expect(from).toBeGreaterThan(-1);
        const yes = canonical.templateText.slice(from, to);
        expect(yes).toMatch(/\$16\/hour to \$18\/hour/);
        expect(canonical.templateText).toMatch(/stays at \$16\/hour/);
      });

      it('forbids padding one side to match the other', () => {
        // Symmetry achieved by inventing detail would be worse than the
        // asymmetry: it trades a thumb on the scale for a fabrication.
        expect(canonical.templateText).toMatch(
          /write less on BOTH rather than padding one/,
        );
      });
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
      expect(OFFSETS_TEXT).toMatch(
        /\u25A1 Offsets are into the raw FullText only/,
      );
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
    it('differs from its offsets form ONLY in the claims contract', () => {
      const neutralise = (text: string): string =>
        text
          .replace(OFFSETS_RULE, '<<CLAIMS_RULE>>')
          .replace(QUOTED_RULE, '<<CLAIMS_RULE>>')
          .replace(OFFSETS_EXAMPLE, '<<CLAIMS_EXAMPLE>>')
          .replace(QUOTED_EXAMPLE, '<<CLAIMS_EXAMPLE>>')
          .replace(OFFSETS_SELFCHECK, '<<CLAIMS_SELFCHECK>>')
          .replace(QUOTED_SELFCHECK, '<<CLAIMS_SELFCHECK>>');

      expect(neutralise(canonical.templateText)).toBe(neutralise(OFFSETS_TEXT));
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
      const out = deriveQuotedClaimsContract(OFFSETS_TEXT);
      expect(out).toContain(QUOTED_RULE);
      expect(out).toContain(QUOTED_EXAMPLE);
      expect(out).not.toContain(OFFSETS_RULE);
      expect(out).not.toContain(OFFSETS_EXAMPLE);
    });
  });
});
