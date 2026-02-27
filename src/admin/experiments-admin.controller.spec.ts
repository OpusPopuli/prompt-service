import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ExperimentsAdminController } from './experiments-admin.controller';
import { AdminService } from './admin.service';

describe('ExperimentsAdminController', () => {
  let controller: ExperimentsAdminController;
  let service: AdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExperimentsAdminController],
      providers: [
        {
          provide: AdminService,
          useValue: {
            createExperiment: jest.fn(),
            listExperiments: jest.fn(),
            getExperiment: jest.fn(),
            activateExperiment: jest.fn(),
            stopExperiment: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('admin-test-key') },
        },
      ],
    }).compile();

    controller = module.get(ExperimentsAdminController);
    service = module.get(AdminService);
  });

  it('should call createExperiment with dto', async () => {
    const dto = {
      name: 'test-exp',
      templateId: 't1',
      variants: [
        { name: 'control', versionId: 'v1', trafficPct: 50 },
        { name: 'variant_a', versionId: 'v2', trafficPct: 50 },
      ],
    };
    const expected = { id: 'exp-1', ...dto, status: 'draft' };
    jest
      .spyOn(service, 'createExperiment')
      .mockResolvedValue(expected as never);

    const result = await controller.create(dto);

    expect(service.createExperiment).toHaveBeenCalledWith(dto);
    expect(result).toEqual(expected);
  });

  it('should call listExperiments', async () => {
    const expected = [{ id: 'exp-1', name: 'test' }];
    jest.spyOn(service, 'listExperiments').mockResolvedValue(expected as never);

    const result = await controller.list();

    expect(service.listExperiments).toHaveBeenCalled();
    expect(result).toEqual(expected);
  });

  it('should call getExperiment with id', async () => {
    const expected = { id: 'exp-1', name: 'test', variants: [] };
    jest.spyOn(service, 'getExperiment').mockResolvedValue(expected as never);

    const result = await controller.getById('exp-1');

    expect(service.getExperiment).toHaveBeenCalledWith('exp-1');
    expect(result).toEqual(expected);
  });

  it('should call activateExperiment with id', async () => {
    const expected = { id: 'exp-1', status: 'active' };
    jest
      .spyOn(service, 'activateExperiment')
      .mockResolvedValue(expected as never);

    const result = await controller.activate('exp-1');

    expect(service.activateExperiment).toHaveBeenCalledWith('exp-1');
    expect(result).toEqual(expected);
  });

  it('should call stopExperiment with id', async () => {
    const expected = { id: 'exp-1', status: 'stopped' };
    jest.spyOn(service, 'stopExperiment').mockResolvedValue(expected as never);

    const result = await controller.stop('exp-1');

    expect(service.stopExperiment).toHaveBeenCalledWith('exp-1');
    expect(result).toEqual(expected);
  });
});
