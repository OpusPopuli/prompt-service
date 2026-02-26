import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VerifyPromptDto {
  @ApiProperty({ description: 'SHA-256 hash of the prompt template' })
  @IsString()
  promptHash: string;

  @ApiProperty({ description: 'Version identifier (e.g., "v1")' })
  @IsString()
  promptVersion: string;
}
