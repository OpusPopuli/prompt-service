import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RollbackTemplateDto {
  @ApiProperty({ description: 'Version number to rollback to', minimum: 1 })
  @IsInt()
  @Min(1)
  targetVersion: number;

  @ApiPropertyOptional({ description: 'Reason for rollback' })
  @IsOptional()
  @IsString()
  changeNote?: string;
}
