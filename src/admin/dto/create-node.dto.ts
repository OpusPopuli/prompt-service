import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, Matches } from 'class-validator';

export class CreateNodeDto {
  @ApiProperty({ description: 'Unique node name (e.g., node-ca-01)' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Name must be lowercase alphanumeric with hyphens',
  })
  name: string;

  @ApiProperty({ description: 'Region identifier (e.g., ca, tx, ny)' })
  @IsString()
  region: string;

  @ApiPropertyOptional({
    description: 'Node public key for signature verification',
  })
  @IsOptional()
  @IsString()
  publicKey?: string;
}
