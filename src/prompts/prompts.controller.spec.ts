import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PromptsController } from './prompts.controller';
import { PromptsService } from './prompts.service';
import { NodeThrottlerGuard } from '../auth/node-throttler.guard';
import { PrismaService } from '../common/prisma.service';
import { VaultService } from '../common/vault.service';

describe('PromptsController', () => {
  let controller: PromptsController;
  let service: PromptsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
      controllers: [PromptsController],
      providers: [
        NodeThrottlerGuard,
        {
          provide: PromptsService,
          useValue: {
            getStructuralAnalysisPrompt: jest.fn(),
            getDocumentAnalysisPrompt: jest.fn(),
            getRagPrompt: jest.fn(),
            getCivicsExtractionPrompt: jest.fn(),
            getBillExtractionPrompt: jest.fn(),
            getBillVotesExtractionPrompt: jest.fn(),
            verifyPrompt: jest.fn(),
            getPromptHash: jest.fn(),
            getPromptTemplate: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-key') },
        },
        {
          provide: PrismaService,
          useValue: { node: { findFirst: jest.fn() } },
        },
        {
          provide: VaultService,
          useValue: { getSecretsByPrefix: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    controller = module.get(PromptsController);
    service = module.get(PromptsService);
  });

  it('should call structuralAnalysis with correct args', async () => {
    const dto = {
      dataType: 'propositions',
      contentGoal: 'goal',
      html: '<div></div>',
    };
    const expected = {
      promptText: 'rendered',
      promptHash: 'abc',
      promptVersion: 'v1',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    };

    jest
      .spyOn(service, 'getStructuralAnalysisPrompt')
      .mockResolvedValue(expected);

    const result = await controller.structuralAnalysis(dto, {
      apiKey: 'key',
      region: 'ca',
    });

    expect(service.getStructuralAnalysisPrompt).toHaveBeenCalledWith(
      dto,
      'key',
      'ca',
    );
    expect(result).toEqual(expected);
  });

  it('should call documentAnalysis with correct args', async () => {
    const dto = { documentType: 'petition', text: 'text' };
    const expected = {
      promptText: 'rendered',
      promptHash: 'abc',
      promptVersion: 'v1',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    };

    jest
      .spyOn(service, 'getDocumentAnalysisPrompt')
      .mockResolvedValue(expected);

    const result = await controller.documentAnalysis(dto, {
      apiKey: 'key',
      region: 'ca',
    });

    expect(service.getDocumentAnalysisPrompt).toHaveBeenCalledWith(
      dto,
      'key',
      'ca',
    );
    expect(result).toEqual(expected);
  });

  it('should call rag with correct args', async () => {
    const dto = { context: 'ctx', query: 'q' };
    const expected = {
      promptText: 'rendered',
      promptHash: 'abc',
      promptVersion: 'v1',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    };

    jest.spyOn(service, 'getRagPrompt').mockResolvedValue(expected);

    const result = await controller.rag(dto, {
      apiKey: 'key',
      region: 'ca',
    });

    expect(service.getRagPrompt).toHaveBeenCalledWith(dto, 'key', 'ca');
    expect(result).toEqual(expected);
  });

  it('should call billExtraction with correct args', async () => {
    const dto = {
      regionId: 'california',
      sourceUrl:
        'https://leginfo.legislature.ca.gov/faces/billStatusClient.xhtml?bill_id=202520260AB1',
      sessionYear: '2025-2026',
      html: '<html/>',
    };
    const expected = {
      promptText: 'rendered',
      promptHash: 'abc',
      promptVersion: 'v1',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    };

    jest.spyOn(service, 'getBillExtractionPrompt').mockResolvedValue(expected);

    const result = await controller.billExtraction(dto, {
      apiKey: 'key',
      region: 'ca',
    });

    expect(service.getBillExtractionPrompt).toHaveBeenCalledWith(
      dto,
      'key',
      'ca',
    );
    expect(result).toEqual(expected);
  });

  it('should call billVotesExtraction with correct args', async () => {
    const dto = {
      regionId: 'california',
      sourceUrl:
        'https://leginfo.legislature.ca.gov/faces/billVotesClient.xhtml?bill_id=202520260AB1',
      sessionYear: '2025-2026',
      billId: '202520260AB1',
      html: '<html/>',
    };
    const expected = {
      promptText: 'rendered',
      promptHash: 'abc',
      promptVersion: 'v1',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    };

    jest
      .spyOn(service, 'getBillVotesExtractionPrompt')
      .mockResolvedValue(expected);

    const result = await controller.billVotesExtraction(dto, {
      apiKey: 'key',
      region: 'ca',
    });

    expect(service.getBillVotesExtractionPrompt).toHaveBeenCalledWith(
      dto,
      'key',
      'ca',
    );
    expect(result).toEqual(expected);
  });

  it('should call verify with correct args', async () => {
    const dto = { promptHash: 'hash123', promptVersion: 'v1' };
    const expected = { valid: true, templateName: 'rag' };

    jest.spyOn(service, 'verifyPrompt').mockResolvedValue(expected);

    const result = await controller.verify(dto);

    expect(service.verifyPrompt).toHaveBeenCalledWith('hash123', 'v1');
    expect(result).toEqual(expected);
  });

  it('should call getPromptHash with the name param', async () => {
    const expected = {
      name: 'structural-analysis',
      promptHash: 'abc',
      promptVersion: 'v1',
    };

    jest.spyOn(service, 'getPromptHash').mockResolvedValue(expected);

    const result = await controller.hash('structural-analysis');

    expect(service.getPromptHash).toHaveBeenCalledWith('structural-analysis');
    expect(result).toEqual(expected);
  });

  it('should call getPromptTemplate with the name and request context (issue #66)', async () => {
    const expected = {
      name: 'bill-extraction',
      templateText: 'tmpl',
      variables: ['REGION_ID', 'HTML'],
      promptHash: 'h',
      promptVersion: 'v2',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      experimentId: null,
      variantName: null,
    };

    jest.spyOn(service, 'getPromptTemplate').mockResolvedValue(expected);

    const result = await controller.template('bill-extraction', {
      apiKey: 'test-key',
      region: 'ca',
    });

    expect(service.getPromptTemplate).toHaveBeenCalledWith(
      'bill-extraction',
      'test-key',
      'ca',
    );
    expect(result).toEqual(expected);
  });
});
