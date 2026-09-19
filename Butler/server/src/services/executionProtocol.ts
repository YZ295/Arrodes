export type ExecutionBackend = 'local-skill' | 'codex' | 'dsh' | 'mcp';
export type ExecutionStatus = 'completed' | 'pending' | 'failed' | 'cancelled';

export interface ExecutionContext {
  localUserId: string;
  workspaceId: string;
  sessionId: string;
}

export interface ExecutionRequest {
  id: string;
  backend: ExecutionBackend;
  /** Stable product-level intent. Authorization rules should target this value. */
  intent: string;
  /** Backend-specific operation name, such as a local skill name. */
  operation: string;
  input: Record<string, unknown>;
  context: ExecutionContext;
  requestedAt: string;
}

export interface ExecutionError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ExecutionEvidence {
  kind: 'log' | 'artifact' | 'test' | 'diff';
  summary: string;
  uri?: string;
}

export interface ExecutionResult {
  requestId: string;
  backend: ExecutionBackend;
  status: ExecutionStatus;
  output?: string;
  error?: ExecutionError;
  evidence: ExecutionEvidence[];
  startedAt: string;
  finishedAt: string;
}

export interface Executor {
  readonly backend: ExecutionBackend;
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
}
