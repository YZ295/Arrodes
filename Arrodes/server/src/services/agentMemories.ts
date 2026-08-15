import type { WorkspaceMemory } from '../workspace/memory-hub.js';
import { workspaceMemoryHub } from '../workspace/memory-hub.js';

export interface RecordAgentMemoryInput {
  workspaceId: string;
  agentId: string;
  content: string;
  type?: WorkspaceMemory['type'];
  hub?: { add(input: {
    content: string;
    sourceAgent?: string;
    type?: string;
    workspaceId?: string;
  }): WorkspaceMemory };
}

export function recordAgentMemory(input: RecordAgentMemoryInput): WorkspaceMemory {
  const hub = input.hub ?? workspaceMemoryHub;
  return hub.add({
    content: input.content.trim(),
    sourceAgent: input.agentId,
    type: input.type || 'note',
    workspaceId: input.workspaceId,
  });
}
