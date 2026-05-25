import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminKeyGuard } from '../auth/admin-key.guard';
import { AdminService } from './admin.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { ListTemplatesQueryDto } from './dto/list-templates.dto';
import { RollbackTemplateDto } from './dto/rollback-template.dto';

// 10/min default is tighter than the global 60/min. Admin endpoints mutate
// templates and shouldn't see legitimate bursts above that — anything
// higher is likely a brute-force probe against the admin key. Configurable
// via ADMIN_THROTTLE_LIMIT for integration test environments that burst
// admin requests across many sequential cases. See #58.
const ADMIN_THROTTLE_LIMIT = Number.parseInt(
  process.env.ADMIN_THROTTLE_LIMIT ?? '10',
  10,
);

@ApiTags('admin')
@Controller('admin/templates')
@UseGuards(AdminKeyGuard)
@Throttle({ default: { ttl: 60_000, limit: ADMIN_THROTTLE_LIMIT } })
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  @ApiOperation({ summary: 'List all prompt templates' })
  async list(@Query() query: ListTemplatesQueryDto) {
    return this.adminService.listTemplates(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get template by ID with version history' })
  async getById(@Param('id') id: string) {
    return this.adminService.getTemplateById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new prompt template' })
  @ApiResponse({ status: 201, description: 'Template created' })
  async create(@Body() dto: CreateTemplateDto) {
    return this.adminService.createTemplate(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a prompt template' })
  async update(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.adminService.updateTemplate(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Soft-delete a prompt template (sets isActive=false)',
  })
  async delete(@Param('id') id: string) {
    return this.adminService.deleteTemplate(id);
  }

  @Post(':id/rollback')
  @ApiOperation({ summary: 'Rollback template to a previous version' })
  async rollback(@Param('id') id: string, @Body() dto: RollbackTemplateDto) {
    return this.adminService.rollbackTemplate(id, dto);
  }
}
