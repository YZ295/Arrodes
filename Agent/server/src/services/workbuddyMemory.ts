import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { workspaceMemoryHub, type WorkspaceMemory, type WorkspaceMemoryType } from '../workspace/memory-hub.js';

export interface WorkbuddyImportResult {
  imported: number;
  skipped: number;
}

export function importWorkbuddyNotes(
  projectDir: string,
  workspaceId: string,
  hub: {
    listAll(workspaceId?: string): WorkspaceMemory[];
    add(input: { content: string; sourceAgent?: string; type?: WorkspaceMemoryType; workspaceId?: string }): WorkspaceMemory;
  } = workspaceMemoryHub,
): WorkbuddyImportResult {
  const memoryDir = join(projectDir, '.workbuddy', 'memory');
  if (!existsSync(memoryDir)) return { imported: 0, skipped: 0 };

  const files = readdirSync(memoryDir).filter((f) => f.endsWith('.md')).sort();
  const existing = hub.listAll(workspaceId).filter((m) => m.sourceAgent === 'workbuddy');
  let imported = 0;
  let skipped = 0;

  for (const file of files) {
    const content = readFileSync(join(memoryDir, file), 'utf-8').trim().slice(0, 2000);
    if (!content || existing.some((m) => m.content === content)) {
      skipped++;
      continue;
    }
    hub.add({ content, sourceAgent: 'workbuddy', type: 'note', workspaceId });
    imported++;
  }
  return { imported, skipped };
}
