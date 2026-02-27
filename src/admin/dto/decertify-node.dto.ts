import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DecertifyNodeDto {
  @ApiProperty({ description: 'Reason for decertification (required)' })
  @IsString()
  reason: string;
}
