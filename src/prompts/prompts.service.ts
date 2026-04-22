import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { ExperimentsService } from '../experiments/experiments.service';
import { StructuralAnalysisDto } from './dto/structural-analysis.dto';
import { DocumentAnalysisDto } from './dto/document-analysis.dto';
import { RagDto } from './dto/rag.dto';

export interface PromptServiceResponse {
  promptText: string;
  promptHash: string;
  promptVersion: string;
  expiresAt: string;
}

export interface VerifyResult {
  valid: boolean;
  templateName?: string;
}

export interface PromptHashResult {
  name: string;
  promptHash: string;
  promptVersion: string;
}

interface ResolvedTemplate {
  templateText: string;
  version: number;
  name: string;
  experimentId?: string;
  variantName?: string;
}

@Injectable()
export class PromptsService {
  private readonly logger = new Logger(PromptsService.name);

  /**
   * Running count of audit-log write failures. Exposed to let ops
   * dashboards (and `/health`) notice when the audit trail is dropping
   * without needing a full Prometheus integration — that's tracked in
   * #27 as a separate follow-up. See #25.
   */
  private auditLogFailureCount = 0;

  /** Total audit-log write failures since process start. */
  getAuditLogFailureCount(): number {
    return this.auditLogFailureCount;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly experiments: ExperimentsService,
  ) {}

  async getStructuralAnalysisPrompt(
    dto: StructuralAnalysisDto,
    apiKey: string,
    region: string,
  ): Promise<PromptServiceResponse> {
    const template = await this.resolveTemplate('structural-analysis', apiKey);

    // Schema/auxiliary templates always use default (no A/B)
    const schemaTemplate = await this.getActiveTemplate(
      `structural-schema-${dto.dataType}`,
      'structural-schema-default',
    );

    const hintsSection = dto.hints?.length
      ? '## Hints from the region author\n' +
        dto.hints.map((h) => '- ' + h).join('\n') +
        '\n'
      : '';

    const promptText = this.interpolate(template.templateText, {
      DATA_TYPE: dto.dataType,
      CONTENT_GOAL: dto.contentGoal,
      CATEGORY: dto.category ?? '',
      HINTS_SECTION: hintsSection,
      SCHEMA_DESCRIPTION: schemaTemplate.templateText,
      HTML: dto.html,
    });

    const response = this.buildResponse(template);
    response.promptText = promptText;

    await this.logRequest(
      'structural-analysis',
      template.version,
      apiKey,
      region,
      template.experimentId,
      template.variantName,
    );

    return response;
  }

  async getDocumentAnalysisPrompt(
    dto: DocumentAnalysisDto,
    apiKey: string,
    region: string,
  ): Promise<PromptServiceResponse> {
    const template = await this.resolveTemplate(
      `document-analysis-${dto.documentType}`,
      apiKey,
      'document-analysis-generic',
    );

    // Base instructions always use default (no A/B)
    const baseInstructions = await this.getActiveTemplate(
      'document-analysis-base-instructions',
    );

    const promptText =
      this.interpolate(template.templateText, { TEXT: dto.text }) +
      '\n' +
      baseInstructions.templateText;

    const response = this.buildResponse(template);
    response.promptText = promptText;

    await this.logRequest(
      'document-analysis',
      template.version,
      apiKey,
      region,
      template.experimentId,
      template.variantName,
    );

    return response;
  }

  async getRagPrompt(
    dto: RagDto,
    apiKey: string,
    region: string,
  ): Promise<PromptServiceResponse> {
    const template = await this.resolveTemplate('rag', apiKey);

    const promptText = this.interpolate(template.templateText, {
      CONTEXT: dto.context,
      QUERY: dto.query,
    });

    const response = this.buildResponse(template);
    response.promptText = promptText;

    await this.logRequest(
      'rag',
      template.version,
      apiKey,
      region,
      template.experimentId,
      template.variantName,
    );

    return response;
  }

  /**
   * Return the current hash + version of a named template, no interpolation.
   * Used by clients to check whether their cached prompt is stale without
   * paying the cost of fetching the full rendered prompt.
   */
  async getPromptHash(name: string): Promise<PromptHashResult> {
    const template = await this.prisma.promptTemplate.findFirst({
      where: { name, isActive: true },
    });

    if (!template) {
      throw new NotFoundException(`Prompt template "${name}" not found`);
    }

    return {
      name: template.name,
      promptHash: this.hash(template.templateText),
      promptVersion: `v${template.version}`,
    };
  }

  async verifyPrompt(
    promptHash: string,
    promptVersion: string,
  ): Promise<VerifyResult> {
    const versionNum = Number.parseInt(promptVersion.replace('v', ''), 10);

    const templates = await this.prisma.promptTemplate.findMany({
      where: { version: Number.isNaN(versionNum) ? undefined : versionNum },
    });

    for (const t of templates) {
      if (this.hash(t.templateText) === promptHash) {
        return { valid: true, templateName: t.name };
      }
    }

    return { valid: false };
  }

  private async resolveTemplate(
    name: string,
    apiKey: string,
    fallbackName?: string,
  ): Promise<ResolvedTemplate> {
    // Check for active A/B experiment first
    const experimentResult = await this.experiments.resolveExperiment(
      name,
      apiKey,
    );
    if (experimentResult) {
      return {
        templateText: experimentResult.templateText,
        version: experimentResult.version,
        name,
        experimentId: experimentResult.experimentId,
        variantName: experimentResult.variantName,
      };
    }

    // Fall back to default active template
    return this.getActiveTemplate(name, fallbackName);
  }

  private async getActiveTemplate(
    name: string,
    fallbackName?: string,
  ): Promise<ResolvedTemplate> {
    let template = await this.prisma.promptTemplate.findFirst({
      where: { name, isActive: true },
    });

    if (!template && fallbackName) {
      template = await this.prisma.promptTemplate.findFirst({
        where: { name: fallbackName, isActive: true },
      });
    }

    if (!template) {
      throw new NotFoundException(`Prompt template "${name}" not found`);
    }

    return template;
  }

  private interpolate(
    template: string,
    variables: Record<string, string>,
  ): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replaceAll(`{{${key}}}`, value);
    }
    return result;
  }

  private hash(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  private buildResponse(template: {
    templateText: string;
    version: number;
  }): PromptServiceResponse {
    const ttlSeconds = this.config.get<number>('PROMPT_TTL_SECONDS', 3600);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    return {
      promptText: '',
      promptHash: this.hash(template.templateText),
      promptVersion: `v${template.version}`,
      expiresAt,
    };
  }

  private async logRequest(
    endpoint: string,
    version: number,
    apiKey: string,
    region: string,
    experimentId?: string,
    variantName?: string,
  ): Promise<void> {
    try {
      await this.prisma.promptRequestLog.create({
        data: {
          endpoint,
          promptVersion: version,
          apiKeyPrefix: apiKey.slice(0, 8) + '...',
          region,
          experimentId: experimentId ?? null,
          variantName: variantName ?? null,
        },
      });
    } catch (err) {
      // Upgrade from warn → error so log-based alerting catches this.
      // Audit logs are compliance-critical for a nonpartisan civic
      // platform; silently losing them is NOT acceptable. We don't
      // block the prompt response (audit is downstream of serving),
      // but we surface the failure loudly. See #25.
      this.auditLogFailureCount += 1;
      this.logger.error(
        {
          event: 'audit_log_write_failure',
          endpoint,
          region,
          apiKeyPrefix: apiKey.slice(0, 8) + '...',
          cumulativeFailures: this.auditLogFailureCount,
          error: (err as Error).message,
        },
        `Failed to write prompt request audit log (failures so far: ${this.auditLogFailureCount})`,
      );
    }
  }
}
