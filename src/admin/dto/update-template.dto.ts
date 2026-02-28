import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { CreateTemplateDto } from './create-template.dto';

export class UpdateTemplateDto extends PartialType(
  OmitType(CreateTemplateDto, ['name'] as const),
) {
  @ApiProperty({ description: 'Change note (required for updates)' })
  @IsString()
  changeNote: string;
}
