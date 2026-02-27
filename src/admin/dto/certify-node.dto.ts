import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class CertifyNodeDto {
  @ApiPropertyOptional({
    description: 'Certification validity in days (default: 365)',
    default: 365,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  expiresInDays?: number;

  @ApiPropertyOptional({ description: 'Reason for certification' })
  @IsOptional()
  @IsString()
  reason?: string;
}
