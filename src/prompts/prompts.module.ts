import { Module } from '@nestjs/common';
import { NodeThrottlerGuard } from '../auth/node-throttler.guard';
import { PromptsController } from './prompts.controller';
import { PromptsService } from './prompts.service';

@Module({
  controllers: [PromptsController],
  providers: [PromptsService, NodeThrottlerGuard],
  exports: [PromptsService],
})
export class PromptsModule {}
