import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';

export interface ExperimentResult {
  templateText: string;
  version: number;
  templateHash: string;
  experimentId: string;
  variantName: string;
}

interface VariantWithVersion {
  name: string;
  trafficPct: number;
  versionEntry: {
    templateText: string;
    version: number;
    templateHash: string;
  };
}

@Injectable()
export class ExperimentsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveExperiment(
    templateName: string,
    apiKey: string,
  ): Promise<ExperimentResult | null> {
    const template = await this.prisma.promptTemplate.findFirst({
      where: { name: templateName, isActive: true },
    });
    if (!template) return null;

    const experiment = await this.prisma.experiment.findFirst({
      where: { templateId: template.id, status: 'active' },
      include: {
        variants: {
          include: { versionEntry: true },
          orderBy: { trafficPct: 'desc' },
        },
      },
    });

    if (!experiment || experiment.variants.length === 0) return null;

    const variant = this.bucketToVariant(
      apiKey,
      experiment.id,
      experiment.variants,
    );

    return {
      templateText: variant.versionEntry.templateText,
      version: variant.versionEntry.version,
      templateHash: variant.versionEntry.templateHash,
      experimentId: experiment.id,
      variantName: variant.name,
    };
  }

  private bucketToVariant(
    apiKey: string,
    experimentId: string,
    variants: VariantWithVersion[],
  ): VariantWithVersion {
    const bucket = this.computeBucket(apiKey, experimentId);
    let cumulative = 0;
    for (const variant of variants) {
      cumulative += variant.trafficPct;
      if (bucket < cumulative) {
        return variant;
      }
    }
    return variants[variants.length - 1];
  }

  computeBucket(apiKey: string, experimentId: string): number {
    const hash = createHash('sha256')
      .update(apiKey + ':' + experimentId)
      .digest('hex');
    const num = parseInt(hash.slice(0, 8), 16);
    return num % 100;
  }
}
