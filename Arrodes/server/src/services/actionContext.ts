import { AsyncLocalStorage } from 'node:async_hooks';
import type { ActionOwner } from './actionGate.js';

export interface ActionScope {
  owner: ActionOwner;
  /** 每次文件执行时读取授权根，令撤销可以立即生效。 */
  getAuthorizedRoots: () => string[];
}

const storage = new AsyncLocalStorage<ActionScope>();

export function withActionScope<T>(scope: ActionScope, callback: () => T): T {
  return storage.run(scope, callback);
}

export function getActionScope(): ActionScope | undefined {
  return storage.getStore();
}
