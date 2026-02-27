import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { ExperimentsAdminController } from './experiments-admin.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminController, ExperimentsAdminController],
  providers: [AdminService],
})
export class AdminModule {}
