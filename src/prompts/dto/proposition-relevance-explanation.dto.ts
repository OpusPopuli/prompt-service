import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

/**
 * Request body for the proposition-relevance-explanation prompt — the
 * LLM is instructed to produce ONE short sentence (15-30 words)
 * explaining why a specific ballot proposition is relevant to a specific
 * user, citing both a proposition provision and 2-4 of the user's
 * declared signals.
 *
 * The output is consumed by opuspopuli#836: a nightly batch job calls
 * this endpoint per user's top ~10 candidate propositions (within their
 * jurisdiction stack), validates the output, and caches
 * `relevanceExplanation` on the user's feed row alongside the equivalent
 * bill explanations. See OpusPopuli/opuspopuli#834 / #836 / #837.
 *
 * Privacy boundary: this endpoint receives ONLY anonymized declared
 * signals — boolean flags the user explicitly set, controlled-vocab
 * interest tags, and a coarse region label. NEVER raw addresses,
 * sensitive T3 fields, or behavioral data. The opuspopuli side enforces
 * this anonymization before crossing the prompt-service boundary
 * (planning doc §6.3 + §10 commitment 7).
 *
 * Controlled vocabularies (topics, whoItAffects, rankingFlags) MUST
 * stay in lockstep with the matching lists in the bill-analysis
 * template (prompt-service#71) and the user-profile schema
 * (opuspopuli#742) — propositions share the same vocab so cross-entity
 * ranking can compare apples to apples. An integration assertion fails
 * if any slug goes missing from the rendered prompt.
 */
export class PropositionRelevanceExplanationDto {
  // ---------- Proposition context (framing) ----------

  @ApiProperty({ description: 'Region identifier (e.g. "california")' })
  @IsString()
  @IsNotEmpty()
  regionId: string;

  @ApiProperty({
    description: 'Proposition display number (e.g. "Measure J", "Prop 12")',
  })
  @IsString()
  @IsNotEmpty()
  propositionNumber: string;

  @ApiProperty({
    description: 'Election date in YYYY-MM-DD format',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'electionDate must be in YYYY-MM-DD format, e.g. "2026-11-03"',
  })
  electionDate: string;

  @ApiProperty({ description: 'Full official proposition title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  // ---------- Proposition structured summary ----------

  @ApiProperty({
    description:
      '2-3 sentence plain-English summary of the proposition. The LLM uses this as the primary signal for what the measure does.',
  })
  @IsString()
  @IsNotEmpty()
  plainEnglishSummary: string;

  @ApiProperty({
    description:
      'Controlled-vocab topic slugs (1-3 values). Overlap with userInterestTags drives the values-alignment signal. Shares the bill-analysis vocabulary.',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  topics: string[];

  @ApiProperty({
    description:
      'Controlled-vocab whoItAffects slugs (0-4 values). Overlap with rankingFlags drives the direct-material signal. Shares the bill-analysis vocabulary.',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  whoItAffects: string[];

  @ApiProperty({
    description: 'Normalized fiscal-impact level.',
    enum: ['none', 'low', 'medium', 'high'],
    required: false,
  })
  @IsOptional()
  @IsIn(['none', 'low', 'medium', 'high'])
  fiscalImpactLevel?: 'none' | 'low' | 'medium' | 'high';

  @ApiProperty({
    description: 'One-sentence fiscal-impact summary.',
    required: false,
  })
  @IsOptional()
  @IsString()
  fiscalImpactSummary?: string;

  @ApiProperty({
    description: 'One-sentence stakeholder-impact summary.',
    required: false,
  })
  @IsOptional()
  @IsString()
  stakeholderImpact?: string;

  @ApiProperty({
    description:
      'Optional provision reference (e.g. "Section 3", "the parental-consent clause") the LLM is asked to cite verbatim. Without a hint the LLM must pick a phrase from the summary.',
    required: false,
  })
  @IsOptional()
  @IsString()
  provisionHint?: string;

  // ---------- User anonymized profile ----------

  @ApiProperty({
    description:
      'User-declared interest tags using the same topics vocabulary as bill-analysis (housing, healthcare, …). Drives values-alignment.',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  userInterestTags: string[];

  @ApiProperty({
    description:
      'Names of the boolean RankingFlags that are TRUE for this user (e.g. ["isRenter", "isParent"]). Only declared signals — never inferred T3. See opuspopuli#742.',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  userRankingFlags: string[];

  @ApiProperty({
    description:
      'Coarse anonymized region label (e.g. "94xxx", "alameda-county"). Opuspopuli is responsible for the anonymization — this endpoint never sees raw addresses.',
    required: false,
  })
  @IsOptional()
  @IsString()
  userRegionLabel?: string;
}
