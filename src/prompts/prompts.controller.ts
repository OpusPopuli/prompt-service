import {
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
import { PromptsService } from './prompts.service';
import { StructuralAnalysisDto } from './dto/structural-analysis.dto';
import { DocumentAnalysisDto } from './dto/document-analysis.dto';
import { RagDto } from './dto/rag.dto';
import { VerifyPromptDto } from './dto/verify-prompt.dto';

@ApiTags('prompts')
@Controller('prompts')
export class PromptsController {
  constructor(private readonly promptsService: PromptsService) {}

  @Post('structural-analysis')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Get structural analysis prompt' })
  @ApiResponse({
    status: 200,
    description: 'Prompt template rendered with variables',
  })
  @ApiResponse({ status: 401, description: 'Invalid API key' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
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
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Get document analysis prompt' })
  @ApiResponse({
    status: 200,
    description: 'Prompt template rendered with variables',
  })
  @ApiResponse({ status: 401, description: 'Invalid API key' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
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
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Get RAG prompt' })
  @ApiResponse({
    status: 200,
    description: 'Prompt template rendered with variables',
  })
  @ApiResponse({ status: 401, description: 'Invalid API key' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async rag(
    @Body() dto: RagDto,
    @Req() req: { apiKey: string; region: string },
  ) {
    return this.promptsService.getRagPrompt(dto, req.apiKey, req.region);
  }

  @Post('verify')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify a prompt hash is authentic' })
  @ApiResponse({ status: 200, description: 'Verification result' })
  @ApiResponse({ status: 401, description: 'Invalid API key' })
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
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @ApiOperation({ summary: 'Get the hash of a named prompt template' })
  @ApiResponse({
    status: 200,
    description: 'Current hash + version of the template',
  })
  @ApiResponse({ status: 401, description: 'Invalid API key' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async hash(@Param('name') name: string) {
    return this.promptsService.getPromptHash(name);
  }
}
