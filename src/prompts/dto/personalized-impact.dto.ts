import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Request body for the personalized-impact prompt — the "What this means to
 * you" read that leads a petition-scan result (OpusPopuli/opuspopuli#1052).
 * The LLM is instructed to produce 2-4 plain-text sentences (40-90 words)
 * mapping the scanned measure's own analysis to the citizen's declared
 * signals, with an explicit why-this-applies-to-you — or the exact sentinel
 * `SKIP` when no defensible personalization exists. The output is rendered
 * to the citizen verbatim, so the contract is plain text, not JSON.
 *
 * Cross-repo contract: corresponds 1:1 with the opuspopuli prompt-client's
 * `composePersonalizedImpact` variable map. When the template gains
 * variables, update both sides in lockstep — integration tests on either
 * side validate.
 *
 * Privacy boundary: same as BillRelevanceExplanationDto — this endpoint
 * receives ONLY anonymized declared signals (controlled-vocab interest
 * tags, names of TRUE RankingFlags, a coarse region label). NEVER raw
 * addresses, sensitive T3 fields, or behavioral data. The opuspopuli side
 * enforces the anonymization before crossing the prompt-service boundary.
 *
 * Size caps are deliberate DoS/abuse hardening: every field below is
 * interpolated into an LLM prompt, so unbounded strings mean unbounded
 * token cost for the caller's inference and this service's bandwidth.
 */
export class PersonalizedImpactDto {
  // ---------- Scanned measure's analysis (from document-analysis output) ----------

  @ApiProperty({ description: 'Document type, e.g. "petition"' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[a-z][a-z0-9_-]*$/, {
    message: 'documentType must be a lowercase slug (e.g. "petition")',
  })
  documentType: string;

  @ApiProperty({
    description:
      'Plain-language summary of the measure from the scan analysis. The LLM grounds every personal-impact claim in this text.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  summary: string;

  @ApiProperty({
    description: 'What the measure actually does, from the scan analysis.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  actualEffect?: string;

  @ApiProperty({
    description: 'Groups the measure benefits (from the scan analysis).',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  beneficiaries: string[];

  @ApiProperty({
    description: 'Groups the measure may burden (from the scan analysis).',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  potentiallyHarmed: string[];

  @ApiProperty({
    description:
      'Optional matched ballot-measure title, when the scan linked the petition to a known measure.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  matchedMeasureTitle?: string;

  // ---------- User anonymized profile ----------

  @ApiProperty({
    description:
      'User-declared interest tags (controlled-vocab slugs, e.g. "housing").',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  userInterestTags: string[];

  @ApiProperty({
    description:
      'Names of the boolean RankingFlags that are TRUE for this user (e.g. ["isRenter"]). Only declared signals — never inferred T3.',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  userRankingFlags: string[];

  @ApiProperty({
    description:
      'Coarse anonymized region label (e.g. "94xxx"). Opuspopuli anonymizes — this endpoint never sees raw addresses.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  userRegionLabel?: string;
}
