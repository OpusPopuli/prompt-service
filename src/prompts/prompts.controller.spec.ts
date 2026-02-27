import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PromptsController } from './prompts.controller';
import { PromptsService } from './prompts.service';

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
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-key') },
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
    });

    expect(service.getStructuralAnalysisPrompt).toHaveBeenCalledWith(
      dto,
      'key',
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

    const result = await controller.documentAnalysis(dto, { apiKey: 'key' });

    expect(service.getDocumentAnalysisPrompt).toHaveBeenCalledWith(dto, 'key');
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

    const result = await controller.rag(dto, { apiKey: 'key' });

    expect(service.getRagPrompt).toHaveBeenCalledWith(dto, 'key');
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
});
