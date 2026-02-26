import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray } from 'class-validator';

export class StructuralAnalysisDto {
  @ApiProperty({
    description:
      'Data type to extract (e.g., propositions, meetings, representatives)',
  })
  @IsString()
  dataType: string;

  @ApiProperty({ description: 'Natural language content goal' })
  @IsString()
  contentGoal: string;

  @ApiPropertyOptional({ description: 'Content category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Hints from region author',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hints?: string[];

  @ApiProperty({ description: 'HTML content to analyze' })
  @IsString()
  html: string;
}
