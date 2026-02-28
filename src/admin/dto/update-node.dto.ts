import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, Matches } from 'class-validator';

export class UpdateNodeDto {
  @ApiPropertyOptional({ description: 'Updated node name' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Name must be lowercase alphanumeric with hyphens',
  })
  name?: string;

  @ApiPropertyOptional({ description: 'Updated region identifier' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: 'Updated public key' })
  @IsOptional()
  @IsString()
  publicKey?: string;
}
