import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  IsInt,
  Min,
  Max,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ExperimentVariantDto {
  @ApiProperty({ description: 'Variant name (e.g., "control", "variant_a")' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'ID of the PromptVersionHistory entry to serve',
  })
  @IsString()
  @IsUUID()
  versionId: string;

  @ApiProperty({
    description: 'Traffic percentage (0-100)',
    minimum: 0,
    maximum: 100,
  })
  @IsInt()
  @Min(0)
  @Max(100)
  trafficPct: number;
}

export class CreateExperimentDto {
  @ApiProperty({ description: 'Unique experiment name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Experiment description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Template ID this experiment applies to' })
  @IsString()
  @IsUUID()
  templateId: string;

  @ApiProperty({
    description: 'Experiment variants (traffic percentages must sum to 100)',
    type: [ExperimentVariantDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExperimentVariantDto)
  @ArrayMinSize(2)
  variants: ExperimentVariantDto[];
}
