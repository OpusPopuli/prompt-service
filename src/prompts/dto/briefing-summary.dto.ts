import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Request body for the briefing-summary prompt — the LLM produces a
 * short 2-3 sentence opening paragraph for the user's `/me/briefing`
 * page (opuspopuli#849 Phase 2). The paragraph IS the warm narrative
 * companion to the deterministic Phase 1 template that the frontend
 * always renders as fallback.
 *
 * The frontend renders this paragraph between the time-of-day
 * greeting ("Good evening, Rodney.") and the deterministic count
 * line ("Below: 5 bills, 7 representatives, …"). On null / skip /
 * validator-rejection, the frontend transparently keeps showing the
 * Phase 1 template — the greeting block never breaks.
 *
 * Privacy boundary: this endpoint receives ONLY non-sensitive
 * anonymized context. The user's first name is T1 (user-provided);
 * counts are aggregates derived from the user's already-rendered
 * briefing data. No T3 traits, no addresses, no behavioral event rows,
 * no UserSession timestamps. Same anonymization rule as the bill /
 * proposition / rep / committee relevance-explanation prompts
 * (planning doc §6.3 + §10 commitment 7).
 *
 * Commitment 4 boundary: the output MUST be descriptive ("here is
 * what's open and what's moving"), never persuasive ("you should
 * read", "you need to support"). This is enforced both inside the
 * prompt's HARD CONSTRAINTS block AND by an opuspopuli-side
 * validator that runs the LLM output through a forbidden-vocab
 * regex pipeline before caching.
 */
export class BriefingSummaryDto {
  @ApiProperty({
    description:
      'Output language — `en` or `es`. The LLM produces the paragraph in this language; both languages are validated against the same commitment-4 vocab pipeline on the opuspopuli side.',
    enum: ['en', 'es'],
  })
  @IsIn(['en', 'es'])
  language: 'en' | 'es';

  @ApiProperty({
    description:
      "User's first name (T1, user-provided). Pass null/undefined to use the no-name register: the LLM addresses the user as `neighbor` in EN, or drops the address word entirely in ES. Capped at 50 chars to match the opuspopuli `user_profile.first_name` column (`VARCHAR(50)`) — anything longer is invalid upstream.",
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @ApiProperty({
    description:
      "Number of bill cards the user will see below the fold. Capped at 200 — well above any realistic per-user feed limit (today the briefing surfaces 5; even a future 'show all matched' affordance wouldn't exceed ~200 in active state).",
  })
  @IsInt()
  @Min(0)
  @Max(200)
  billCount: number;

  @ApiProperty({
    description:
      'Number of representative cards. Capped at 50 — a single user has fed/state/local reps in the single digits; 50 leaves headroom for future expansions.',
  })
  @IsInt()
  @Min(0)
  @Max(50)
  repCount: number;

  @ApiProperty({
    description:
      "Number of committee cards. Capped at 50 — typical surface is <10; a state legislature has ~30 standing committees so 50 covers 'all committees a user's reps sit on' worst case.",
  })
  @IsInt()
  @Min(0)
  @Max(50)
  committeeCount: number;

  @ApiProperty({
    description:
      'Number of proposition cards. Capped at 100 — a single ballot rarely exceeds ~15 propositions; 100 covers users with multiple jurisdictions.',
  })
  @IsInt()
  @Min(0)
  @Max(100)
  propositionCount: number;

  @ApiProperty({
    description:
      "How many of the user's top-ranked bills have an actionability axis score >= 0.5 — i.e. an upcoming hearing, vote, or comment window within ~30 days. Drives the urgency beat in the paragraph. Same cap as `billCount` since this is a subset.",
  })
  @IsInt()
  @Min(0)
  @Max(200)
  urgentBillCount: number;

  @ApiProperty({
    description:
      "Top-ranking axis on the highest-scoring bill — lets the LLM frame the stake of the top match (money/rights/services for `directMaterial`, topic alignment for `valuesAlignment`, time-sensitivity for `actionability`). Callers MUST omit this field when no bills exist; the rendered prompt receives the literal string `none` in that case. Sending the literal string `none` as the field value is rejected by the IsIn validator.",
    enum: ['directMaterial', 'valuesAlignment', 'actionability'],
    required: false,
  })
  @IsOptional()
  @IsIn(['directMaterial', 'valuesAlignment', 'actionability'])
  topBillTopAxis?: 'directMaterial' | 'valuesAlignment' | 'actionability';
}
