import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';

/**
 * Request body for the civics-extraction prompt — the LLM is
 * instructed to return JSON matching `@opuspopuli/common`'s
 * `CivicsBlock` shape, with every text field carrying BOTH the
 * verbatim source text AND a plain-language rewrite for laypeople.
 *
 * See OpusPopuli/opuspopuli#669 +
 * OpusPopuli/opuspopuli-regions#15.
 */
export class CivicsExtractionDto {
  @ApiProperty({
    description: 'Region identifier (e.g. "california")',
  })
  @IsString()
  regionId: string;

  @ApiProperty({
    description:
      'URL the HTML/text was scraped from. Used in the prompt so each extracted CivicText.sourceUrl can cite back to it.',
  })
  @IsString()
  sourceUrl: string;

  @ApiProperty({
    description:
      'Natural-language extraction goal from the region config dataSource.contentGoal',
  })
  @IsString()
  contentGoal: string;

  @ApiPropertyOptional({
    description:
      'Optional sub-category from the region config (e.g. "Assembly")',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description:
      'Optional hints from region author to disambiguate / scope extraction',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hints?: string[];

  @ApiProperty({
    description: 'Raw HTML or text content scraped from sourceUrl',
  })
  @IsString()
  html: string;

  @ApiPropertyOptional({
    description:
      'Compact mode for bulk extraction — instructs the model to emit ' +
      'verbatim-only CivicText (omitting the plain-language rewrite on every ' +
      'field), roughly halving output tokens. The consumer fills plainLanguage ' +
      'from verbatim (or a later pass). Defaults to false (full dual-text). ' +
      'Selects the `civics-extraction-compact` template. See opuspopuli#92.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  compact?: boolean;
}
