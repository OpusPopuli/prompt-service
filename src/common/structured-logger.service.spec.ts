import { StructuredLoggerService } from './structured-logger.service';
import { correlationStorage } from './correlation.storage';

describe('StructuredLoggerService', () => {
  let logger: StructuredLoggerService;

  beforeEach(() => {
    logger = new StructuredLoggerService('TestContext');
  });

  describe('dev mode (default)', () => {
    it('logs without throwing', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      expect(() => logger.log('hello world')).not.toThrow();
      spy.mockRestore();
    });

    it('logs warn and error without throwing', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      expect(() => logger.warn('a warning')).not.toThrow();
      expect(() => logger.error('an error', 'stack trace')).not.toThrow();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('production mode (NODE_ENV=production)', () => {
    let stdoutSpy: jest.SpyInstance;
    const origEnv = process.env.NODE_ENV;

    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      stdoutSpy = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation((_chunk: unknown) => true);
    });

    afterEach(() => {
      process.env.NODE_ENV = origEnv;
      stdoutSpy.mockRestore();
    });

    const captureJson = (): Record<string, unknown> => {
      const raw = (stdoutSpy.mock.calls as [string][]).map(([c]) => c).join('');
      return JSON.parse(raw.trim()) as Record<string, unknown>;
    };

    it('emits structured JSON with required fields', () => {
      logger.log('hello');
      const parsed = captureJson();
      expect(parsed.level).toBe('log');
      expect(parsed.service).toBe('prompt-service');
      expect(parsed.message).toBe('hello');
      expect(typeof parsed.timestamp).toBe('string');
    });

    it('includes correlationId from ALS store', () => {
      correlationStorage.run({ correlationId: 'corr-xyz' }, () => {
        logger.log('hello');
        expect(captureJson().correlationId).toBe('corr-xyz');
      });
    });

    it('includes nodeId and endpoint from ALS store', () => {
      correlationStorage.run(
        { correlationId: 'c1', nodeId: 'node-1', endpoint: '/prompts/rag' },
        () => {
          logger.log('event');
          const parsed = captureJson();
          expect(parsed.nodeId).toBe('node-1');
          expect(parsed.endpoint).toBe('/prompts/rag');
        },
      );
    });

    it('omits correlationId when ALS store is empty', () => {
      logger.log('no context');
      expect(captureJson()).not.toHaveProperty('correlationId');
    });

    it('includes context stripped of brackets', () => {
      logger.log('action', 'MyService');
      expect(captureJson().context).toBe('MyService');
    });
  });

  it('handles missing ALS store gracefully', () => {
    expect(correlationStorage.getStore()).toBeUndefined();
  });
});
