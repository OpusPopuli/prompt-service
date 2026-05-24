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

const INVALID_API_KEY = 'Invalid API key';
const TEMPLATE_NOT_FOUND = 'Template not found';

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
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
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
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
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
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Get RAG prompt' })
  @ApiPromptResponses()
  async rag(
    @Body() dto: RagDto,
    @Req() req: { apiKey: string; region: string },
  ) {
    return this.promptsService.getRagPrompt(dto, req.apiKey, req.region);
  }

  @Post('civics-extraction')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
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
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
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
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
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
}
