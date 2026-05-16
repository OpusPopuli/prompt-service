import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * Request body for the bill-votes-extraction prompt — the LLM is
 * instructed to return structured chamber-level roll-call vote records
 * (including per-member positions) from a billVotesClient page on an
 * official state legislature website.
 *
 * Companion to bill-extraction — votes are always extracted in a
 * separate call. See OpusPopuli/opuspopuli#686.
 */
export class BillVotesExtractionDto {
  @ApiProperty({
    description: 'Region identifier (e.g. "california")',
  })
  @IsString()
  @IsNotEmpty()
  regionId: string;

  @ApiProperty({
    description: 'URL the HTML was scraped from',
  })
  @IsString()
  @IsNotEmpty()
  sourceUrl: string;

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
    description:
      'Bill ID (raw bill_id URL parameter, e.g. "202520260AB1") — used as the system key in the output',
  })
  @IsString()
  @IsNotEmpty()
  billId: string;

  @ApiProperty({
    description: 'Raw HTML of the bill votes page',
  })
  @IsString()
  @IsNotEmpty()
  html: string;
}
