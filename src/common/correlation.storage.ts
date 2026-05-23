import { AsyncLocalStorage } from 'node:async_hooks';

export interface CorrelationStore {
  correlationId: string;
  nodeId?: string;
  endpoint?: string;
}

export const correlationStorage = new AsyncLocalStorage<CorrelationStore>();
