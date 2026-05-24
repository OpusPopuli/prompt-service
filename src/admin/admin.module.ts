import { Module } from '@nestjs/common';
import { makeGaugeProvider } from '@willsoto/nestjs-prometheus';
import { AdminController } from './admin.controller';
import { ExperimentsAdminController } from './experiments-admin.controller';
import { NodeRegistryController } from './node-registry.controller';
import { AdminService } from './admin.service';
import { NodeRegistryService } from './node-registry.service';
import {
  CertExpirySchedulerService,
  CERT_EXPIRY_CRITICAL_METRIC,
  CERT_EXPIRY_SOON_METRIC,
} from './cert-expiry-scheduler.service';

@Module({
  controllers: [
    AdminController,
    ExperimentsAdminController,
    NodeRegistryController,
  ],
  providers: [
    AdminService,
    NodeRegistryService,
    CertExpirySchedulerService,
    makeGaugeProvider({
      name: CERT_EXPIRY_SOON_METRIC,
      help: 'Number of certified nodes whose certification expires within 30 days',
    }),
    makeGaugeProvider({
      name: CERT_EXPIRY_CRITICAL_METRIC,
      help: 'Number of certified nodes whose certification expires within 7 days',
    }),
  ],
})
export class AdminModule {}
