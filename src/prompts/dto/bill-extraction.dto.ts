import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * Request body for the bill-extraction prompt — the LLM is
 * instructed to return JSON matching `@opuspopuli/common`'s `Bill`
 * shape, including raw author/co-author name strings and a `votes[]`
 * array of per-member roll-call positions extracted from the bill's
 * vote-history section.
 *
 * See OpusPopuli/opuspopuli#686.
 */
export class BillExtractionDto {
  @ApiProperty({
    description: 'Region identifier (e.g. "california")',
  })
  @IsString()
  @IsNotEmpty()
  regionId: string;

  @ApiProperty({
    description: 'URL the HTML was scraped from — becomes Bill.sourceUrl',
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
    description: 'Raw HTML of the bill detail page',
  })
  @IsString()
  @IsNotEmpty()
  html: string;
}
