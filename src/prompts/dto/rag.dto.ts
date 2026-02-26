import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RagDto {
  @ApiProperty({ description: 'Context passages for RAG' })
  @IsString()
  context: string;

  @ApiProperty({ description: 'User query' })
  @IsString()
  query: string;
}
