import { ConsoleLogger, Injectable, LogLevel } from '@nestjs/common';
import { correlationStorage } from './correlation.storage';

@Injectable()
export class StructuredLoggerService extends ConsoleLogger {
  protected formatMessage(
    logLevel: LogLevel,
    message: unknown,
    pidMessage: string,
    formattedLogLevel: string,
    contextMessage: string,
    timestampDiff: string,
  ): string {
    if (process.env.NODE_ENV === 'production') {
      return (
        JSON.stringify(this.buildEntry(logLevel, message, contextMessage)) +
        '\n'
      );
    }
    return super.formatMessage(
      logLevel,
      message,
      pidMessage,
      formattedLogLevel,
      contextMessage,
      timestampDiff,
    );
  }

  private buildEntry(
    level: LogLevel,
    message: unknown,
    contextMessage: string,
  ): Record<string, unknown> {
    const store = correlationStorage.getStore();
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      service: 'prompt-service',
      message,
    };

    const ctx = contextMessage
      .replace(/\x1B\[[0-9;]*m/g, '') // strip ANSI color codes added by NestJS
      .replace(/[\[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (ctx) entry.context = ctx;
    if (store?.correlationId) entry.correlationId = store.correlationId;
    if (store?.nodeId) entry.nodeId = store.nodeId;
    if (store?.endpoint) entry.endpoint = store.endpoint;

    return entry;
  }
}
