import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NodeRegistryController } from './node-registry.controller';
import { NodeRegistryService } from './node-registry.service';
import { VaultService } from '../common/vault.service';

describe('NodeRegistryController', () => {
  let controller: NodeRegistryController;
  let service: NodeRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NodeRegistryController],
      providers: [
        {
          provide: NodeRegistryService,
          useValue: {
            registerNode: jest.fn(),
            listNodes: jest.fn(),
            getNode: jest.fn(),
            updateNode: jest.fn(),
            certifyNode: jest.fn(),
            decertifyNode: jest.fn(),
            recertifyNode: jest.fn(),
            rotateApiKey: jest.fn(),
            deleteNode: jest.fn(),
            getHealthDashboard: jest.fn(),
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

    controller = module.get(NodeRegistryController);
    service = module.get(NodeRegistryService);
  });

  it('should call registerNode with dto and admin key prefix', async () => {
    const dto = { name: 'node-ca-01', region: 'ca' };
    const expected = { id: '1', ...dto, apiKey: 'key', status: 'pending' };
    jest.spyOn(service, 'registerNode').mockResolvedValue(expected as never);

    const result = await controller.register(dto, {
      adminKey: 'admin-test-key-123',
    });

    expect(service.registerNode).toHaveBeenCalledWith(dto, 'admin-te...');
    expect(result).toEqual(expected);
  });

  it('should call listNodes with query', async () => {
    const query = { region: 'ca' };
    const expected = [{ id: '1', name: 'node-ca-01' }];
    jest.spyOn(service, 'listNodes').mockResolvedValue(expected as never);

    const result = await controller.list(query);

    expect(service.listNodes).toHaveBeenCalledWith(query);
    expect(result).toEqual(expected);
  });

  it('should call getHealthDashboard', async () => {
    const expected = { totalNodes: 5, byStatus: {} };
    jest
      .spyOn(service, 'getHealthDashboard')
      .mockResolvedValue(expected as never);

    const result = await controller.healthDashboard();

    expect(service.getHealthDashboard).toHaveBeenCalled();
    expect(result).toEqual(expected);
  });

  it('should call getNode with id', async () => {
    const expected = { id: '1', name: 'node-ca-01', auditLogs: [] };
    jest.spyOn(service, 'getNode').mockResolvedValue(expected as never);

    const result = await controller.getById('1');

    expect(service.getNode).toHaveBeenCalledWith('1');
    expect(result).toEqual(expected);
  });

  it('should call updateNode with id and dto', async () => {
    const dto = { name: 'updated-name' };
    const expected = { id: '1', name: 'updated-name' };
    jest.spyOn(service, 'updateNode').mockResolvedValue(expected as never);

    const result = await controller.update('1', dto);

    expect(service.updateNode).toHaveBeenCalledWith('1', dto);
    expect(result).toEqual(expected);
  });

  it('should call certifyNode with id, dto, and admin key prefix', async () => {
    const dto = { expiresInDays: 90 };
    const expected = { id: '1', status: 'certified' };
    jest.spyOn(service, 'certifyNode').mockResolvedValue(expected as never);

    const result = await controller.certify('1', dto, {
      adminKey: 'admin-test-key-123',
    });

    expect(service.certifyNode).toHaveBeenCalledWith('1', dto, 'admin-te...');
    expect(result).toEqual(expected);
  });

  it('should call decertifyNode with id, dto, and admin key prefix', async () => {
    const dto = { reason: 'Terms violation' };
    const expected = { id: '1', status: 'decertified' };
    jest.spyOn(service, 'decertifyNode').mockResolvedValue(expected as never);

    const result = await controller.decertify('1', dto, {
      adminKey: 'admin-test-key-123',
    });

    expect(service.decertifyNode).toHaveBeenCalledWith('1', dto, 'admin-te...');
    expect(result).toEqual(expected);
  });

  it('should call recertifyNode with id, dto, and admin key prefix', async () => {
    const dto = { expiresInDays: 365 };
    const expected = { id: '1', status: 'certified' };
    jest.spyOn(service, 'recertifyNode').mockResolvedValue(expected as never);

    const result = await controller.recertify('1', dto, {
      adminKey: 'admin-test-key-123',
    });

    expect(service.recertifyNode).toHaveBeenCalledWith('1', dto, 'admin-te...');
    expect(result).toEqual(expected);
  });

  it('should call rotateApiKey with id and admin key prefix', async () => {
    const expected = { id: '1', apiKey: 'new-key' };
    jest.spyOn(service, 'rotateApiKey').mockResolvedValue(expected as never);

    const result = await controller.rotateKey('1', {
      adminKey: 'admin-test-key-123',
    });

    expect(service.rotateApiKey).toHaveBeenCalledWith('1', 'admin-te...');
    expect(result).toEqual(expected);
  });

  it('should call deleteNode with id', async () => {
    const expected = { deleted: true };
    jest.spyOn(service, 'deleteNode').mockResolvedValue(expected as never);

    const result = await controller.delete('1');

    expect(service.deleteNode).toHaveBeenCalledWith('1');
    expect(result).toEqual(expected);
  });

  describe('error propagation', () => {
    it('should propagate NotFoundException from getNode', async () => {
      jest
        .spyOn(service, 'getNode')
        .mockRejectedValue(new NotFoundException('Node not-found not found'));

      await expect(controller.getById('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should propagate NotFoundException from certifyNode', async () => {
      jest
        .spyOn(service, 'certifyNode')
        .mockRejectedValue(new NotFoundException());

      await expect(
        controller.certify('not-found', {}, { adminKey: 'admin-key-12345' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should propagate BadRequestException from certifyNode on decertified node', async () => {
      jest
        .spyOn(service, 'certifyNode')
        .mockRejectedValue(
          new BadRequestException('Cannot certify a decertified node'),
        );

      await expect(
        controller.certify('1', {}, { adminKey: 'admin-key-12345' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should propagate NotFoundException from decertifyNode', async () => {
      jest
        .spyOn(service, 'decertifyNode')
        .mockRejectedValue(new NotFoundException());

      await expect(
        controller.decertify(
          'not-found',
          { reason: 'test' },
          { adminKey: 'admin-key-12345' },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should propagate NotFoundException from deleteNode', async () => {
      jest
        .spyOn(service, 'deleteNode')
        .mockRejectedValue(new NotFoundException());

      await expect(controller.delete('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
