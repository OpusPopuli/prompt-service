import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdminKeyGuard } from '../auth/admin-key.guard';
import { NodeRegistryService } from './node-registry.service';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { ListNodesQueryDto } from './dto/list-nodes-query.dto';
import { CertifyNodeDto } from './dto/certify-node.dto';
import { DecertifyNodeDto } from './dto/decertify-node.dto';

@ApiTags('admin - nodes')
@Controller('admin/nodes')
@UseGuards(AdminKeyGuard)
@ApiBearerAuth()
export class NodeRegistryController {
  constructor(private readonly nodeRegistry: NodeRegistryService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new node' })
  @ApiResponse({
    status: 201,
    description: 'Node registered with generated API key',
  })
  async register(@Body() dto: CreateNodeDto, @Req() req: { adminKey: string }) {
    const adminKeyPrefix = req.adminKey.slice(0, 8) + '...';
    return this.nodeRegistry.registerNode(dto, adminKeyPrefix);
  }

  @Get()
  @ApiOperation({ summary: 'List all nodes' })
  async list(@Query() query: ListNodesQueryDto) {
    return this.nodeRegistry.listNodes(query);
  }

  @Get('health')
  @ApiOperation({ summary: 'Node health dashboard' })
  async healthDashboard() {
    return this.nodeRegistry.getHealthDashboard();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get node details with audit log' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  async getById(@Param('id') id: string) {
    return this.nodeRegistry.getNode(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update node metadata' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateNodeDto) {
    return this.nodeRegistry.updateNode(id, dto);
  }

  @Post(':id/certify')
  @ApiOperation({ summary: 'Certify a node (enable its API key)' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  async certify(
    @Param('id') id: string,
    @Body() dto: CertifyNodeDto,
    @Req() req: { adminKey: string },
  ) {
    const adminKeyPrefix = req.adminKey.slice(0, 8) + '...';
    return this.nodeRegistry.certifyNode(id, dto, adminKeyPrefix);
  }

  @Post(':id/decertify')
  @ApiOperation({ summary: 'Decertify a node (revoke its API key)' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  async decertify(
    @Param('id') id: string,
    @Body() dto: DecertifyNodeDto,
    @Req() req: { adminKey: string },
  ) {
    const adminKeyPrefix = req.adminKey.slice(0, 8) + '...';
    return this.nodeRegistry.decertifyNode(id, dto, adminKeyPrefix);
  }

  @Post(':id/recertify')
  @ApiOperation({ summary: 'Re-certify a node (renew certification)' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  async recertify(
    @Param('id') id: string,
    @Body() dto: CertifyNodeDto,
    @Req() req: { adminKey: string },
  ) {
    const adminKeyPrefix = req.adminKey.slice(0, 8) + '...';
    return this.nodeRegistry.recertifyNode(id, dto, adminKeyPrefix);
  }

  @Post(':id/rotate-key')
  @ApiOperation({ summary: 'Rotate a node API key' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  async rotateKey(@Param('id') id: string, @Req() req: { adminKey: string }) {
    const adminKeyPrefix = req.adminKey.slice(0, 8) + '...';
    return this.nodeRegistry.rotateApiKey(id, adminKeyPrefix);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a node' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  async delete(@Param('id') id: string) {
    return this.nodeRegistry.deleteNode(id);
  }
}
