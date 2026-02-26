import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { ListTemplatesQueryDto } from './dto/list-templates.dto';
import { RollbackTemplateDto } from './dto/rollback-template.dto';
import { CreateExperimentDto } from './dto/create-experiment.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listTemplates(filters: ListTemplatesQueryDto) {
    const where: Record<string, unknown> = {};
    if (filters.category) where.category = filters.category;
    if (filters.isActive !== undefined) where.isActive = filters.isActive;

    return this.prisma.promptTemplate.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async getTemplateById(id: string) {
    const template = await this.prisma.promptTemplate.findUnique({
      where: { id },
      include: { versionHistory: { orderBy: { version: 'desc' } } },
    });

    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }

    return template;
  }

  async createTemplate(dto: CreateTemplateDto) {
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.promptTemplate.create({
        data: {
          name: dto.name,
          category: dto.category,
          description: dto.description,
          templateText: dto.templateText,
          variables: dto.variables ?? [],
        },
      });

      await tx.promptVersionHistory.create({
        data: {
          templateId: template.id,
          version: template.version,
          templateText: template.templateText,
          templateHash: this.hash(template.templateText),
          changeNote: dto.changeNote ?? 'Initial creation',
        },
      });

      return template;
    });
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.promptTemplate.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException(`Template ${id} not found`);
      }

      const newVersion = existing.version + 1;
      const updateData: Record<string, unknown> = { version: newVersion };

      if (dto.templateText !== undefined)
        updateData.templateText = dto.templateText;
      if (dto.description !== undefined)
        updateData.description = dto.description;
      if (dto.category !== undefined) updateData.category = dto.category;
      if (dto.variables !== undefined) updateData.variables = dto.variables;

      const updated = await tx.promptTemplate.update({
        where: { id },
        data: updateData,
      });

      await tx.promptVersionHistory.create({
        data: {
          templateId: id,
          version: newVersion,
          templateText: updated.templateText,
          templateHash: this.hash(updated.templateText),
          changeNote: dto.changeNote,
        },
      });

      return updated;
    });
  }

  async deleteTemplate(id: string) {
    const template = await this.prisma.promptTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }

    return this.prisma.promptTemplate.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async rollbackTemplate(id: string, dto: RollbackTemplateDto) {
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.promptTemplate.findUnique({ where: { id } });
      if (!template) {
        throw new NotFoundException(`Template ${id} not found`);
      }

      const targetHistory = await tx.promptVersionHistory.findFirst({
        where: { templateId: id, version: dto.targetVersion },
      });
      if (!targetHistory) {
        throw new NotFoundException(
          `Version ${dto.targetVersion} not found for template ${id}`,
        );
      }

      const newVersion = template.version + 1;

      const updated = await tx.promptTemplate.update({
        where: { id },
        data: {
          templateText: targetHistory.templateText,
          version: newVersion,
        },
      });

      await tx.promptVersionHistory.create({
        data: {
          templateId: id,
          version: newVersion,
          templateText: targetHistory.templateText,
          templateHash: targetHistory.templateHash,
          changeNote:
            dto.changeNote ?? `Rollback to version ${dto.targetVersion}`,
        },
      });

      return updated;
    });
  }

  // --- Experiment methods ---

  async createExperiment(dto: CreateExperimentDto) {
    const totalPct = dto.variants.reduce((sum, v) => sum + v.trafficPct, 0);
    if (totalPct !== 100) {
      throw new BadRequestException(
        `Variant traffic percentages must sum to 100, got ${totalPct}`,
      );
    }

    const template = await this.prisma.promptTemplate.findUnique({
      where: { id: dto.templateId },
    });
    if (!template) {
      throw new NotFoundException(`Template ${dto.templateId} not found`);
    }

    for (const v of dto.variants) {
      const version = await this.prisma.promptVersionHistory.findUnique({
        where: { id: v.versionId },
      });
      if (!version) {
        throw new NotFoundException(`Version entry ${v.versionId} not found`);
      }
    }

    return this.prisma.experiment.create({
      data: {
        name: dto.name,
        description: dto.description,
        templateId: dto.templateId,
        status: 'draft',
        variants: {
          create: dto.variants.map((v) => ({
            name: v.name,
            versionId: v.versionId,
            trafficPct: v.trafficPct,
          })),
        },
      },
      include: { variants: true },
    });
  }

  async listExperiments() {
    return this.prisma.experiment.findMany({
      include: { variants: true, template: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getExperiment(id: string) {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id },
      include: {
        variants: { include: { versionEntry: true } },
        template: true,
      },
    });
    if (!experiment) {
      throw new NotFoundException(`Experiment ${id} not found`);
    }
    return experiment;
  }

  async activateExperiment(id: string) {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id },
    });
    if (!experiment) {
      throw new NotFoundException(`Experiment ${id} not found`);
    }
    if (experiment.status !== 'draft') {
      throw new BadRequestException(
        `Experiment is ${experiment.status}, can only activate from draft`,
      );
    }

    const existing = await this.prisma.experiment.findFirst({
      where: {
        templateId: experiment.templateId,
        status: 'active',
        id: { not: id },
      },
    });
    if (existing) {
      throw new BadRequestException(
        `Template already has active experiment: ${existing.name}`,
      );
    }

    return this.prisma.experiment.update({
      where: { id },
      data: { status: 'active' },
      include: { variants: true },
    });
  }

  async stopExperiment(id: string) {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id },
    });
    if (!experiment) {
      throw new NotFoundException(`Experiment ${id} not found`);
    }

    return this.prisma.experiment.update({
      where: { id },
      data: { status: 'stopped', stoppedAt: new Date() },
      include: { variants: true },
    });
  }

  private hash(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }
}
