import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ListNodesQueryDto {
  @ApiPropertyOptional({ description: 'Filter by region' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({
    description: 'Filter by status (pending, certified, decertified, expired)',
  })
  @IsOptional()
  @IsString()
  status?: string;
}
