import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PromptsController } from './prompts.controller';
import { PromptsService } from './prompts.service';
import { PrismaService } from '../common/prisma.service';
import { VaultService } from '../common/vault.service';

describe('PromptsController', () => {
  let controller: PromptsController;
  let service: PromptsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PromptsController],
      providers: [
        {
          provide: PromptsService,
          useValue: {
            getStructuralAnalysisPrompt: jest.fn(),
            getDocumentAnalysisPrompt: jest.fn(),
            getRagPrompt: jest.fn(),
            verifyPrompt: jest.fn(),
            getPromptHash: jest.fn(),
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
});
