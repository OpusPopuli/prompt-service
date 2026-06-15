import {
  applyDecorators,
  Body,
  Controller,
  Get,
  Param,
  Post,
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
import { ApiKeyGuard } from '../auth/api-key.guard';
import { NodeThrottlerGuard } from '../auth/node-throttler.guard';
import { PromptsService } from './prompts.service';
import { StructuralAnalysisDto } from './dto/structural-analysis.dto';
import { DocumentAnalysisDto } from './dto/document-analysis.dto';
import { RagDto } from './dto/rag.dto';
import { VerifyPromptDto } from './dto/verify-prompt.dto';
import { CivicsExtractionDto } from './dto/civics-extraction.dto';
import { BillExtractionDto } from './dto/bill-extraction.dto';
import { BillVotesExtractionDto } from './dto/bill-votes-extraction.dto';
import { BillAnalysisDto } from './dto/bill-analysis.dto';
import { BillRelevanceExplanationDto } from './dto/bill-relevance-explanation.dto';
import { BillStatusSummaryDto } from './dto/bill-status-summary.dto';
import { PropositionRelevanceExplanationDto } from './dto/proposition-relevance-explanation.dto';
import { RepresentativeRelevanceExplanationDto } from './dto/representative-relevance-explanation.dto';
import { CommitteeRelevanceExplanationDto } from './dto/committee-relevance-explanation.dto';
import { BriefingSummaryDto } from './dto/briefing-summary.dto';

const INVALID_API_KEY = 'Invalid API key';
const TEMPLATE_NOT_FOUND = 'Template not found';

// Per-route limit on prompt composition POSTs. 30/min default is generous
// for a single legitimate node — comfortably above sustained scraping
// cadence while bounding accidental loops. Configurable via
// PROMPT_THROTTLE_LIMIT so integration test envs (which fire ~80 prompt
// POSTs from a single container IP through a shared `default` throttler
// bucket) can raise it without bypassing the production behavior tested
// elsewhere. Mirrors ADMIN_THROTTLE_LIMIT and GLOBAL_THROTTLE_LIMIT.
const PROMPT_THROTTLE_LIMIT = Number.parseInt(
  process.env.PROMPT_THROTTLE_LIMIT ?? '30',
  10,
);

function ApiPromptResponses() {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: 'Prompt template rendered with variables',
    }),
    ApiResponse({ status: 401, description: INVALID_API_KEY }),
    ApiResponse({ status: 404, description: TEMPLATE_NOT_FOUND }),
    ApiResponse({ status: 429, description: 'Rate limit exceeded' }),
  );
}

@ApiTags('prompts')
@Controller('prompts')
// ApiKeyGuard must come before NodeThrottlerGuard so req.nodeId / req.apiKey
// are populated before the per-node bucket key is resolved.
@UseGuards(ApiKeyGuard, NodeThrottlerGuard)
@ApiBearerAuth()
export class PromptsController {
  constructor(private readonly promptsService: PromptsService) {}

  @Post('structural-analysis')
  @Throttle({ default: { ttl: 60_000, limit: PROMPT_THROTTLE_LIMIT } })
  @ApiOperation({ summary: 'Get structural analysis prompt' })
  @ApiPromptResponses()
  async structuralAnalysis(
    @Body() dto: StructuralAnalysisDto,
    @Req() req: { apiKey: string; region: string },
  ) {
    return this.promptsService.getStructuralAnalysisPrompt(
      dto,
      req.apiKey,
      req.region,
    );
  }

  @Post('document-analysis')
  @Throttle({ default: { ttl: 60_000, limit: PROMPT_THROTTLE_LIMIT } })
  @ApiOperation({ summary: 'Get document analysis prompt' })
  @ApiPromptResponses()
  async documentAnalysis(
    @Body() dto: DocumentAnalysisDto,
    @Req() req: { apiKey: string; region: string },
  ) {
    return this.promptsService.getDocumentAnalysisPrompt(
      dto,
      req.apiKey,
      req.region,
    );
  }

  @Post('rag')
  @Throttle({ default: { ttl: 60_000, limit: PROMPT_THROTTLE_LIMIT } })
  @ApiOperation({ summary: 'Get RAG prompt' })
  @ApiPromptResponses()
  async rag(
    @Body() dto: RagDto,
    @Req() req: { apiKey: string; region: string },
  ) {
    return this.promptsService.getRagPrompt(dto, req.apiKey, req.region);
  }

  @Post('civics-extraction')
  @Throttle({ default: { ttl: 60_000, limit: PROMPT_THROTTLE_LIMIT } })
  @ApiOperation({
    summary:
      'Get civics-extraction prompt. The LLM is instructed to emit a CivicsBlock with verbatim source text + plain-language rewrites for laypeople. See OpusPopuli/opuspopuli#669.',
  })
  @ApiPromptResponses()
  async civicsExtraction(
    @Body() dto: CivicsExtractionDto,
    @Req() req: { apiKey: string; region: string },
  ) {
    return this.promptsService.getCivicsExtractionPrompt(
      dto,
      req.apiKey,
      req.region,
    );
  }

  @Post('bill-extraction')
  @Throttle({ default: { ttl: 60_000, limit: PROMPT_THROTTLE_LIMIT } })
  @ApiOperation({
    summary:
      'Get bill-extraction prompt. The LLM is instructed to emit a structured Bill record from a single official legislature bill status page. See OpusPopuli/opuspopuli#686.',
  })
  @ApiPromptResponses()
  async billExtraction(
    @Body() dto: BillExtractionDto,
    @Req() req: { apiKey: string; region: string },
  ) {
    return this.promptsService.getBillExtractionPrompt(
      dto,
      req.apiKey,
      req.region,
    );
  }

  @Post('bill-votes-extraction')
  @Throttle({ default: { ttl: 60_000, limit: PROMPT_THROTTLE_LIMIT } })
  @ApiOperation({
    summary:
      'Get bill-votes-extraction prompt. The LLM is instructed to emit structured chamber-level roll-call vote records (per-member positions) from a billVotesClient page. See OpusPopuli/opuspopuli#686.',
  })
  @ApiPromptResponses()
  async billVotesExtraction(
    @Body() dto: BillVotesExtractionDto,
    @Req() req: { apiKey: string; region: string },
  ) {
    return this.promptsService.getBillVotesExtractionPrompt(
      dto,
      req.apiKey,
      req.region,
    );
  }

  @Post('bill-analysis')
  @Throttle({ default: { ttl: 60_000, limit: PROMPT_THROTTLE_LIMIT } })
  @ApiOperation({
    summary:
      'Get bill-analysis prompt. The LLM is instructed to emit a structured plain-English summary of a legislative bill (plainEnglishSummary, topics[], whoItAffects[], fiscalImpact, stakeholderImpact) for the personalization pipeline. See OpusPopuli/opuspopuli#740 / #741.',
  })
  @ApiPromptResponses()
  async billAnalysis(
    @Body() dto: BillAnalysisDto,
    @Req() req: { apiKey: string; region: string },
  ) {
    return this.promptsService.getBillAnalysisPrompt(
      dto,
      req.apiKey,
      req.region,
    );
  }

  @Post('bill-relevance-explanation')
  @Throttle({ default: { ttl: 60_000, limit: PROMPT_THROTTLE_LIMIT } })
  @ApiOperation({
    summary:
      "Get bill-relevance-explanation prompt. The LLM is instructed to emit ONE sentence (15-30 words) explaining why a specific bill is relevant to a specific user, citing a bill provision + 2-4 of the user's declared signals — or `{ skip: true }` if no defensible narrative is possible under planning-doc §5.3 constraints. Consumed by opuspopuli#745. See OpusPopuli/opuspopuli#740 / #745.",
  })
  @ApiPromptResponses()
  async billRelevanceExplanation(
    @Body() dto: BillRelevanceExplanationDto,
    @Req() req: { apiKey: string; region: string },
  ) {
    return this.promptsService.getBillRelevanceExplanationPrompt(
      dto,
      req.apiKey,
      req.region,
    );
  }

  @Post('briefing-summary')
  @Throttle({ default: { ttl: 60_000, limit: PROMPT_THROTTLE_LIMIT } })
  @ApiOperation({
    summary:
      "Get briefing-summary prompt. The LLM is instructed to emit a 2-3 sentence opening paragraph (30-60 words) for the user's `/me/briefing` page — a warm, descriptive narrative companion to the deterministic Phase 1 template. MUST be descriptive (\"here's what's open\"), NEVER persuasive (\"you should\"). Returns `{ paragraph: string }` or `{ skip: true, reason: string }`. Consumed by opuspopuli#849 Phase 2. See OpusPopuli/opuspopuli#849.",
  })
  @ApiPromptResponses()
  async briefingSummary(
    @Body() dto: BriefingSummaryDto,
    @Req() req: { apiKey: string; region: string },
  ) {
    return this.promptsService.getBriefingSummaryPrompt(
      dto,
      req.apiKey,
      req.region,
    );
  }

  @Post('bill-status-summary')
  @Throttle({ default: { ttl: 60_000, limit: PROMPT_THROTTLE_LIMIT } })
  @ApiOperation({
    summary:
      "Get bill-status-summary prompt. The LLM is instructed to emit ONE structured object combining (a) verbatim status + classified lifecycle stage from the region's taxonomy + last-action + changed flag, (b) plain-English summary with controlled-vocab topics/whoItAffects/fiscalImpact/stakeholderImpact, and (c) a `{ skip: true }` sentinel for non-bills. Replaces two prior LLM calls + the 92%-miss pattern matcher. See OpusPopuli/opuspopuli#823.",
  })
  @ApiPromptResponses()
  async billStatusSummary(
    @Body() dto: BillStatusSummaryDto,
    @Req() req: { apiKey: string; region: string },
  ) {
    return this.promptsService.getBillStatusSummaryPrompt(
      dto,
      req.apiKey,
      req.region,
    );
  }

  @Post('proposition-relevance-explanation')
  @Throttle({ default: { ttl: 60_000, limit: PROMPT_THROTTLE_LIMIT } })
  @ApiOperation({
    summary:
      "Get proposition-relevance-explanation prompt. The LLM is instructed to emit ONE sentence (15-30 words) explaining why a specific ballot proposition is relevant to a specific user, citing a provision + 2-4 of the user's declared signals — or `{ skip: true }` if no defensible narrative is possible under planning-doc §5.3 constraints. Vote recommendations are forbidden. Consumed by opuspopuli#836. See OpusPopuli/opuspopuli#834.",
  })
  @ApiPromptResponses()
  async propositionRelevanceExplanation(
    @Body() dto: PropositionRelevanceExplanationDto,
    @Req() req: { apiKey: string; region: string },
  ) {
    return this.promptsService.getPropositionRelevanceExplanationPrompt(
      dto,
      req.apiKey,
      req.region,
    );
  }

  @Post('representative-relevance-explanation')
  @Throttle({ default: { ttl: 60_000, limit: PROMPT_THROTTLE_LIMIT } })
  @ApiOperation({
    summary:
      "Get representative-relevance-explanation prompt. The LLM is instructed to emit ONE sentence (15-30 words) explaining why a specific elected representative is the right person to engage with on the user's declared issues, citing ONE jurisdictional anchor (committee/topic/recent action/upcoming event) + 2-4 declared signals — or `{ skip: true }` when no overlap exists. Speculation about beliefs or future votes is forbidden. Consumed by opuspopuli#836. See OpusPopuli/opuspopuli#834.",
  })
  @ApiPromptResponses()
  async representativeRelevanceExplanation(
    @Body() dto: RepresentativeRelevanceExplanationDto,
    @Req() req: { apiKey: string; region: string },
  ) {
    return this.promptsService.getRepresentativeRelevanceExplanationPrompt(
      dto,
      req.apiKey,
      req.region,
    );
  }

  @Post('committee-relevance-explanation')
  @Throttle({ default: { ttl: 60_000, limit: PROMPT_THROTTLE_LIMIT } })
  @ApiOperation({
    summary:
      'Get committee-relevance-explanation prompt. The LLM is instructed to emit ONE sentence (15-30 words) explaining why a legislative committee is worth knowing about for a specific user, citing ONE anchor (rep on user\'s slate / topic overlap / recent activity / upcoming hearing) + 2-4 declared signals — or `{ skip: true }` when no overlap exists. The strongest anchor when present is "your rep serves on it". Consumed by opuspopuli#836. See OpusPopuli/opuspopuli#834.',
  })
  @ApiPromptResponses()
  async committeeRelevanceExplanation(
    @Body() dto: CommitteeRelevanceExplanationDto,
    @Req() req: { apiKey: string; region: string },
  ) {
    return this.promptsService.getCommitteeRelevanceExplanationPrompt(
      dto,
      req.apiKey,
      req.region,
    );
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify a prompt hash is authentic' })
  @ApiResponse({ status: 200, description: 'Verification result' })
  @ApiResponse({ status: 401, description: INVALID_API_KEY })
  async verify(@Body() dto: VerifyPromptDto) {
    return this.promptsService.verifyPrompt(dto.promptHash, dto.promptVersion);
  }

  /**
   * Return the current hash + version of a named template, with no
   * interpolation. Used by clients to cheaply check whether a cached prompt
   * is stale (SHA-256 of the bare template text). Authoritative source of
   * truth for manifest cache invalidation.
   */
  @Get(':name/hash')
  // 120/min vs 30/min on composition endpoints: this endpoint is a DB lookup
  // only (no interpolation, no experiment bucketing, no request log write).
  // The 4x headroom reflects the real cost differential and allows clients to
  // poll for cache invalidation without crowding out composition quota.
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @ApiOperation({ summary: 'Get the hash of a named prompt template' })
  @ApiResponse({
    status: 200,
    description: 'Current hash + version of the template',
  })
  @ApiResponse({ status: 401, description: INVALID_API_KEY })
  @ApiResponse({ status: 404, description: TEMPLATE_NOT_FOUND })
  async hash(@Param('name') name: string) {
    return this.promptsService.getPromptHash(name);
  }

  /**
   * Return the raw template payload (text + variables + metadata) for
   * client-side caching and local interpolation. Designed to let clients
   * stop calling the per-call composition endpoints on every bill/document
   * — fetch once, cache for `expiresAt`, interpolate locally. A/B variants
   * resolve server-side. See issue #66 and opuspopuli#729.
   */
  @Get(':name')
  // 120/min: same as /:name/hash since this is also a cache-warmer endpoint
  // that healthy clients hit infrequently (once per template per TTL window,
  // not once per call).
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @ApiOperation({
    summary:
      'Get the raw template payload for client-side caching + local interpolation',
  })
  @ApiResponse({
    status: 200,
    description:
      'Raw template + variables + hash + version + expiresAt + experiment context',
  })
  @ApiResponse({ status: 401, description: INVALID_API_KEY })
  @ApiResponse({ status: 404, description: TEMPLATE_NOT_FOUND })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async template(
    @Param('name') name: string,
    @Req() req: { apiKey: string; region: string },
  ) {
    return this.promptsService.getPromptTemplate(name, req.apiKey, req.region);
  }
}
