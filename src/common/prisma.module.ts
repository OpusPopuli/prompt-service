import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { VaultService } from './vault.service';

@Global()
@Module({
  providers: [PrismaService, VaultService],
  exports: [PrismaService, VaultService],
})
export class PrismaModule {}
