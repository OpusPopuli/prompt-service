import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

/**
 * One entry in the region's lifecycle-stage taxonomy. Sourced from
 * `civics_blocks.lifecycle_stages` on the calling node and passed in at
 * request time rather than baked into the prompt — each region declares
 * its own legislative process. The LLM picks one stage `id` from this
 * list (or returns `"unknown"`); the caller writes it verbatim to
 * `bills.current_stage_id`.
 */
export class LifecycleStageInput {
  @ApiProperty({
    description:
      'Stage ID — must match a value stored in civics_blocks.lifecycle_stages. Written verbatim to bills.current_stage_id.',
  })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description:
      'Plain-language stage name shown to the LLM (e.g. "In Committee").',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'One-sentence description of when this stage applies.',
  })
  @IsString()
  @IsNotEmpty()
  description: string;
}

/**
 * Request body for the merged `bill-status-summary` prompt — the LLM is
 * instructed to extract three things in ONE call:
 *
 *   1. **status**  — verbatim status string + classified lifecycle stage
 *      (from the region's taxonomy) + last-action date + a `changed`
 *      signal so the caller can skip a no-op DB write.
 *   2. **summary** — plain-English overview with controlled-vocab
 *      `topics`, `whoItAffects`, structured `fiscalImpact`, and
 *      `stakeholderImpact` — drop-in replacement for the existing
 *      bill-analysis output, so downstream consumers like
 *      bill-relevance-explanation (#72) keep working unchanged.
 *   3. **skip sentinel** — `{ skip: true }` for non-bills / garbled
 *      inputs.
 *
 * Replaces two prior LLM calls (status extraction inside bill-extraction
 * + bill-analysis) plus the deterministic `resolveStageFromStatus()`
 * pattern matcher that only resolved 8% of CA bills. The bill-extraction
 * prompt remains for the structural fields it owns (billNumber, author,
 * vote URLs); its LLM-driven status portion collapses into this merged
 * call. See OpusPopuli/opuspopuli#823.
 *
 * Region taxonomy: `lifecycleStages` is the source of truth for the LLM's
 * stage classification. Hardcoding an enum in the prompt would force every
 * new region to conform to whatever the first region happened to define —
 * antithetical to the declarative-region-config architecture. The LLM must
 * pick exactly one of the supplied stage IDs, or `"unknown"` when no stage
 * fits, and the caller falls back to the deterministic pattern matcher
 * (and structured warn log) on `"unknown"`.
 */
export class BillStatusSummaryDto {
  @ApiProperty({ description: 'Region identifier (e.g. "california")' })
  @IsString()
  @IsNotEmpty()
  regionId: string;

  @ApiProperty({
    description: 'Bill display number (e.g. "AB 1", "SB 500")',
  })
  @IsString()
  @IsNotEmpty()
  billNumber: string;

  @ApiProperty({
    description: 'Legislative session in YYYY-YYYY format, e.g. "2025-2026"',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{4}$/, {
    message: 'sessionYear must be in YYYY-YYYY format, e.g. "2025-2026"',
  })
  sessionYear: string;

  @ApiProperty({ description: 'Full official bill title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description:
      'Raw HTML of the bill detail page. Carries both the verbatim status string and the bill body the summary draws from.',
  })
  @IsString()
  @IsNotEmpty()
  html: string;

  @ApiProperty({
    description:
      "Region-specific lifecycle taxonomy from civics_blocks.lifecycle_stages. The LLM picks one stage.id from this list (or returns 'unknown'). MUST contain at least one entry — the call is meaningless without a taxonomy to classify into.",
    type: [LifecycleStageInput],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LifecycleStageInput)
  lifecycleStages: LifecycleStageInput[];

  @ApiProperty({
    description:
      'Prior known status verbatim (the value currently stored in bills.status). Used to set `status.changed`. Omit on first ingest.',
    required: false,
  })
  @IsOptional()
  @IsString()
  priorStatus?: string;

  @ApiProperty({
    description:
      'Prior known stage id (current value of bills.current_stage_id). Lets the LLM detect stage transitions even when the status text is unchanged.',
    required: false,
  })
  @IsOptional()
  @IsString()
  priorStage?: string;
}
