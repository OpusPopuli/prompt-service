import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdminKeyGuard } from '../auth/admin-key.guard';
import { AdminService } from './admin.service';
import { CreateExperimentDto } from './dto/create-experiment.dto';

@ApiTags('admin - experiments')
@Controller('admin/experiments')
@UseGuards(AdminKeyGuard)
@ApiBearerAuth()
export class ExperimentsAdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new A/B testing experiment' })
  @ApiResponse({
    status: 201,
    description: 'Experiment created in draft status',
  })
  async create(@Body() dto: CreateExperimentDto) {
    return this.adminService.createExperiment(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all experiments' })
  async list() {
    return this.adminService.listExperiments();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get experiment details' })
  async getById(@Param('id') id: string) {
    return this.adminService.getExperiment(id);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate an experiment (start serving variants)' })
  async activate(@Param('id') id: string) {
    return this.adminService.activateExperiment(id);
  }

  @Post(':id/stop')
  @ApiOperation({ summary: 'Stop an experiment' })
  async stop(@Param('id') id: string) {
    return this.adminService.stopExperiment(id);
  }
}
