import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { ExperimentsAdminController } from './experiments-admin.controller';
import { NodeRegistryController } from './node-registry.controller';
import { AdminService } from './admin.service';
import { NodeRegistryService } from './node-registry.service';

@Module({
  controllers: [
    AdminController,
    ExperimentsAdminController,
    NodeRegistryController,
  ],
  providers: [AdminService, NodeRegistryService],
})
export class AdminModule {}
