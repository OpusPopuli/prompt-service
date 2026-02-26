import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DocumentAnalysisDto {
  @ApiProperty({
    description: 'Document type (e.g., petition, proposition, contract, form)',
  })
  @IsString()
  documentType: string;

  @ApiProperty({ description: 'Document text content' })
  @IsString()
  text: string;
}
