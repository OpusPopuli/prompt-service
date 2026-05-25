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
import { Throttle } from '@nestjs/throttler';
import { AdminKeyGuard } from '../auth/admin-key.guard';
import { NodeRegistryService } from './node-registry.service';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { ListNodesQueryDto } from './dto/list-nodes-query.dto';
import { CertifyNodeDto } from './dto/certify-node.dto';
import { DecertifyNodeDto } from './dto/decertify-node.dto';

const NODE_NOT_FOUND = 'Node not found';

// 10/min default — stricter than the global 60/min for admin actions
// (key rotation, certification). Configurable via ADMIN_THROTTLE_LIMIT.
// See #58 and src/admin/admin.controller.ts for the rationale.
const ADMIN_THROTTLE_LIMIT = Number.parseInt(
  process.env.ADMIN_THROTTLE_LIMIT ?? '10',
  10,
);

@ApiTags('admin - nodes')
@Controller('admin/nodes')
@UseGuards(AdminKeyGuard)
@Throttle({ default: { ttl: 60_000, limit: ADMIN_THROTTLE_LIMIT } })
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
  @ApiResponse({ status: 404, description: NODE_NOT_FOUND })
  async getById(@Param('id') id: string) {
    return this.nodeRegistry.getNode(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update node metadata' })
  @ApiResponse({ status: 404, description: NODE_NOT_FOUND })
  async update(@Param('id') id: string, @Body() dto: UpdateNodeDto) {
    return this.nodeRegistry.updateNode(id, dto);
  }

  @Post(':id/certify')
  @ApiOperation({ summary: 'Certify a node (enable its API key)' })
  @ApiResponse({ status: 404, description: NODE_NOT_FOUND })
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
  @ApiResponse({ status: 404, description: NODE_NOT_FOUND })
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
  @ApiResponse({ status: 404, description: NODE_NOT_FOUND })
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
  @ApiResponse({ status: 404, description: NODE_NOT_FOUND })
  async rotateKey(@Param('id') id: string, @Req() req: { adminKey: string }) {
    const adminKeyPrefix = req.adminKey.slice(0, 8) + '...';
    return this.nodeRegistry.rotateApiKey(id, adminKeyPrefix);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a node' })
  @ApiResponse({ status: 404, description: NODE_NOT_FOUND })
  async delete(@Param('id') id: string) {
    return this.nodeRegistry.deleteNode(id);
  }
}
