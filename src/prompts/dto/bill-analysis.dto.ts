import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

/**
 * Request body for the bill-analysis prompt — the LLM is instructed to
 * return a structured plain-English summary of a legislative bill,
 * tagged with controlled-vocabulary `topics` and `whoItAffects` lists
 * plus a normalized fiscal-impact level.
 *
 * The output is consumed by the personalization pipeline (opuspopuli#741
 * stores it on the Bill row; opuspopuli#743 embeds the summary text and
 * matches the tags against user profile interests). The controlled
 * vocabularies MUST stay in lockstep with the matching lists in the
 * user-profile schema (opuspopuli#742) and the bill-relevance-explanation
 * prompt (prompt-service#72). See OpusPopuli/opuspopuli#740.
 */
export class BillAnalysisDto {
  @ApiProperty({
    description: 'Region identifier (e.g. "california")',
  })
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

  @ApiProperty({
    description: 'Full official bill title as it appears on the source page',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description:
      'Subject tag from the bill page if present (e.g. "Taxation: property tax: exemptions")',
    required: false,
  })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty({
    description:
      'Verbatim current status (e.g. "Enrolled and presented to the Governor"). Used as framing context only — not part of the summary output.',
    required: false,
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({
    description: 'Primary author full name as listed on the bill page',
    required: false,
  })
  @IsOptional()
  @IsString()
  authorName?: string;

  @ApiProperty({
    description:
      'Verbatim official summary from the bill page (legislative-counsel digest, sponsor description, etc.) if available. Boosts summary fidelity when present.',
    required: false,
  })
  @IsOptional()
  @IsString()
  officialSummary?: string;

  @ApiProperty({
    description:
      'Verbatim fiscal-impact summary from the Fiscal Committee or legislative analyst, if present. The LLM uses this to set fiscalImpact.level rather than guessing.',
    required: false,
  })
  @IsOptional()
  @IsString()
  fiscalImpactSummary?: string;

  @ApiProperty({
    description:
      "Full bill text (or as much as fits in the caller's token budget). The caller is responsible for truncation — the prompt does not chunk.",
  })
  @IsString()
  @IsNotEmpty()
  fullText: string;
}
