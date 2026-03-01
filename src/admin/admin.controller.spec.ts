import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { VaultService } from '../common/vault.service';

describe('AdminController', () => {
  let controller: AdminController;
  let service: AdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: {
            listTemplates: jest.fn(),
            getTemplateById: jest.fn(),
            createTemplate: jest.fn(),
            updateTemplate: jest.fn(),
            deleteTemplate: jest.fn(),
            rollbackTemplate: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('admin-test-key') },
        },
        {
          provide: VaultService,
          useValue: { getSecretsByPrefix: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    controller = module.get(AdminController);
    service = module.get(AdminService);
  });

  it('should call listTemplates with query', async () => {
    const query = { category: 'rag' };
    const expected = [{ id: '1', name: 'rag' }];
    jest.spyOn(service, 'listTemplates').mockResolvedValue(expected as never);

    const result = await controller.list(query);

    expect(service.listTemplates).toHaveBeenCalledWith(query);
    expect(result).toEqual(expected);
  });

  it('should call getTemplateById with id', async () => {
    const expected = { id: '1', name: 'test', versionHistory: [] };
    jest.spyOn(service, 'getTemplateById').mockResolvedValue(expected as never);

    const result = await controller.getById('1');

    expect(service.getTemplateById).toHaveBeenCalledWith('1');
    expect(result).toEqual(expected);
  });

  it('should call createTemplate with dto', async () => {
    const dto = {
      name: 'new',
      category: 'rag',
      description: 'desc',
      templateText: 'text',
    };
    const expected = { id: '1', ...dto, version: 1 };
    jest.spyOn(service, 'createTemplate').mockResolvedValue(expected as never);

    const result = await controller.create(dto);

    expect(service.createTemplate).toHaveBeenCalledWith(dto);
    expect(result).toEqual(expected);
  });

  it('should call updateTemplate with id and dto', async () => {
    const dto = { templateText: 'updated', changeNote: 'change' };
    const expected = { id: '1', version: 2 };
    jest.spyOn(service, 'updateTemplate').mockResolvedValue(expected as never);

    const result = await controller.update('1', dto);

    expect(service.updateTemplate).toHaveBeenCalledWith('1', dto);
    expect(result).toEqual(expected);
  });

  it('should call deleteTemplate with id', async () => {
    const expected = { id: '1', isActive: false };
    jest.spyOn(service, 'deleteTemplate').mockResolvedValue(expected as never);

    const result = await controller.delete('1');

    expect(service.deleteTemplate).toHaveBeenCalledWith('1');
    expect(result).toEqual(expected);
  });

  it('should call rollbackTemplate with id and dto', async () => {
    const dto = { targetVersion: 1, changeNote: 'rollback' };
    const expected = { id: '1', version: 3 };
    jest
      .spyOn(service, 'rollbackTemplate')
      .mockResolvedValue(expected as never);

    const result = await controller.rollback('1', dto);

    expect(service.rollbackTemplate).toHaveBeenCalledWith('1', dto);
    expect(result).toEqual(expected);
  });
});
