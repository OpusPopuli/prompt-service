import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Upcoming hearing entry — a single committee hearing the user could
 * follow or attend. The LLM may cite the topic + date verbatim as a
 * relevance anchor.
 */
export class CommitteeUpcomingHearingInput {
  @ApiProperty({ description: 'Hearing date in YYYY-MM-DD format' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'hearing date must be in YYYY-MM-DD format, e.g. "2026-06-28"',
  })
  date: string;

  @ApiProperty({
    description:
      'One-line topic / agenda summary for the hearing (e.g. "Rent control reform").',
  })
  @IsString()
  @IsNotEmpty()
  topic: string;
}

/**
 * Request body for the committee-relevance-explanation prompt — the LLM
 * is instructed to produce ONE short sentence (15-30 words) explaining
 * why a specific legislative committee is relevant to a specific user,
 * citing one anchor (member-on-user-slate, topic overlap, or upcoming
 * hearing) + 2-4 of the user's declared signals.
 *
 * The output is consumed by opuspopuli#836: a nightly batch job calls
 * this endpoint per user's resolved committee candidates (committees
 * where one of the user's reps sits, or committees acting on bills that
 * match the user's interest tags), validates the output, and caches
 * `relevanceExplanation` on the user's feed row. See
 * OpusPopuli/opuspopuli#770 / #816 / #834 / #836 / #837.
 *
 * Privacy boundary: this endpoint receives ONLY anonymized declared
 * signals — boolean flags the user explicitly set, controlled-vocab
 * interest tags, and a coarse region label. NEVER raw addresses,
 * sensitive T3 fields, or behavioral data. The opuspopuli side enforces
 * this anonymization before crossing the prompt-service boundary
 * (planning doc §6.3 + §10 commitment 7).
 *
 * The `membersOnUserSlate` field is the strongest available anchor —
 * "your rep serves on this committee" is a verifiable, jurisdiction-
 * preserving claim. The opuspopuli side passes only the rep names the
 * user already sees on their slate; this endpoint never learns the
 * user's full rep roster beyond the intersect.
 */
export class CommitteeRelevanceExplanationDto {
  // ---------- Committee context (framing) ----------

  @ApiProperty({ description: 'Region identifier (e.g. "california")' })
  @IsString()
  @IsNotEmpty()
  regionId: string;

  @ApiProperty({
    description:
      'Committee display name (e.g. "Assembly Judiciary Committee").',
  })
  @IsString()
  @IsNotEmpty()
  committeeName: string;

  @ApiProperty({
    description: 'Chamber + level the committee sits in.',
    enum: [
      'us_house',
      'us_senate',
      'state_assembly',
      'state_senate',
      'joint',
      'state_other',
    ],
  })
  @IsIn([
    'us_house',
    'us_senate',
    'state_assembly',
    'state_senate',
    'joint',
    'state_other',
  ])
  jurisdiction:
    | 'us_house'
    | 'us_senate'
    | 'state_assembly'
    | 'state_senate'
    | 'joint'
    | 'state_other';

  @ApiProperty({
    description: 'Committee type.',
    enum: ['standing', 'select', 'joint', 'subcommittee'],
    required: false,
  })
  @IsOptional()
  @IsIn(['standing', 'select', 'joint', 'subcommittee'])
  committeeType?: 'standing' | 'select' | 'joint' | 'subcommittee';

  // ---------- Committee structured facts (anchor candidates) ----------

  @ApiProperty({
    description:
      "1-2 sentence plain-English description of the committee's jurisdiction. Framing context — used for grounding only, not as a citable anchor.",
  })
  @IsString()
  @IsNotEmpty()
  mandateSummary: string;

  @ApiProperty({
    description:
      'Controlled-vocab topic slugs the committee covers (0-3 values). Shares the bill-analysis vocabulary. Overlap with userInterestTags drives a values-alignment anchor.',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  topics: string[];

  @ApiProperty({
    description:
      'Names of the user\'s representatives who currently sit on this committee (0-6 entries). Always supply — pass `[]` when no overlap. When non-empty, the strongest anchor: "your rep serves on it" is verifiable and jurisdiction-preserving. The opuspopuli consumer MUST intersect this with the user\'s resolved rep slate before calling — see opuspopuli#836.',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  membersOnUserSlate: string[];

  @ApiProperty({
    description:
      'Controlled-vocab topic slugs from bills the committee has acted on in the recent window (0-3 values). Always supply — pass `[]` when no recent activity. Drives the "currently working on" framing.',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  recentBillTopicsTouched: string[];

  @ApiProperty({
    description:
      'Upcoming committee hearings the user could follow (0-3 entries). Always supply — pass `[]` when none scheduled. When non-empty, may be cited as a time-sensitive anchor.',
    type: [CommitteeUpcomingHearingInput],
  })
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => CommitteeUpcomingHearingInput)
  upcomingHearings: CommitteeUpcomingHearingInput[];

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
