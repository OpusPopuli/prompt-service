import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Request body for the representative-relevance-explanation prompt — the
 * LLM is instructed to produce ONE short sentence (15-30 words) explaining
 * why a specific elected representative is relevant to a specific user,
 * citing one anchor (committee assignment, topic focus, or recent action)
 * + 2-4 of the user's declared signals.
 *
 * The output is consumed by opuspopuli#836: a nightly batch job calls
 * this endpoint per user's resolved rep slate (federal + state + county
 * + city), validates the output, and caches `relevanceExplanation` on
 * the user's feed row alongside the equivalent bill explanations. See
 * OpusPopuli/opuspopuli#834 / #836 / #837.
 *
 * Privacy boundary: this endpoint receives ONLY anonymized declared
 * signals — boolean flags the user explicitly set, controlled-vocab
 * interest tags, and a coarse region label. NEVER raw addresses,
 * sensitive T3 fields, or behavioral data. The opuspopuli side enforces
 * this anonymization before crossing the prompt-service boundary
 * (planning doc §6.3 + §10 commitment 7).
 *
 * Neutrality boundary: a representative is a person. The template's
 * hard constraints forbid speculation about their motives, ideology, or
 * future actions. The LLM cites only declared facts (committee, party,
 * documented recent action) and explains relevance — never endorsement.
 */
export class RepresentativeRelevanceExplanationDto {
  // ---------- Representative context (framing) ----------

  @ApiProperty({ description: 'Region identifier (e.g. "california")' })
  @IsString()
  @IsNotEmpty()
  regionId: string;

  @ApiProperty({
    description:
      'Representative\'s display name (e.g. "Rep. Zoe Lofgren"). Used in the framing line only — the LLM never names third parties beyond this person.',
  })
  @IsString()
  @IsNotEmpty()
  repName: string;

  @ApiProperty({
    description:
      'Office title with chamber + district (e.g. "U.S. House CA-18", "California Senate D-15").',
  })
  @IsString()
  @IsNotEmpty()
  officeTitle: string;

  @ApiProperty({
    description: 'Jurisdiction scope.',
    enum: ['federal', 'state', 'county', 'city'],
  })
  @IsIn(['federal', 'state', 'county', 'city'])
  jurisdiction: 'federal' | 'state' | 'county' | 'city';

  @ApiProperty({
    description:
      'Informational party label (democrat | republican | independent | nonpartisan). Carried for framing — the template forbids editorial use.',
    enum: ['democrat', 'republican', 'independent', 'nonpartisan'],
    required: false,
  })
  @IsOptional()
  @IsIn(['democrat', 'republican', 'independent', 'nonpartisan'])
  party?: 'democrat' | 'republican' | 'independent' | 'nonpartisan';

  // ---------- Representative structured facts (anchor candidates) ----------

  @ApiProperty({
    description:
      '1-2 sentence plain-English description of what this office does (jurisdiction, scope of authority). The LLM uses this for framing context, not as a citable anchor.',
  })
  @IsString()
  @IsNotEmpty()
  mandateSummary: string;

  @ApiProperty({
    description:
      'Controlled-vocab topic slugs the rep has been most active on in the current session (0-3 values). Shares the bill-analysis vocabulary. Overlap with userInterestTags drives a values-alignment anchor.',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  topicsOfFocus: string[];

  @ApiProperty({
    description:
      'Committee names the rep currently sits on (0-6 entries). When non-empty, the strongest anchor for jurisdictional relevance.',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  committeeMemberships: string[];

  @ApiProperty({
    description:
      "One-sentence verbatim description of the rep's most recent meaningful legislative action (vote, sponsorship, hearing). Optional anchor.",
    required: false,
  })
  @IsOptional()
  @IsString()
  recentLegislativeAction?: string;

  @ApiProperty({
    description:
      'Optional single-line description of an upcoming public event (e.g. "Town hall on housing — 2026-06-28, San Jose"). The LLM may cite this when present.',
    required: false,
  })
  @IsOptional()
  @IsString()
  upcomingEvent?: string;

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
