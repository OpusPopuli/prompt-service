import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, Matches } from 'class-validator';

export class CreateTemplateDto {
  @ApiProperty({
    description: 'Unique template name (e.g., document-analysis-petition)',
  })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Name must be lowercase alphanumeric with hyphens',
  })
  name: string;

  @ApiProperty({
    description: 'Template category',
    enum: ['structural_analysis', 'document_analysis', 'rag'],
  })
  @IsString()
  category: string;

  @ApiProperty({ description: 'Human-readable description' })
  @IsString()
  description: string;

  @ApiProperty({
    description: 'Template text with {{VARIABLE}} placeholders',
  })
  @IsString()
  templateText: string;

  @ApiPropertyOptional({
    description: 'List of expected variable names',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @ApiPropertyOptional({ description: 'Change note for version history' })
  @IsOptional()
  @IsString()
  changeNote?: string;
}
