import { describe, it, expect, beforeEach } from 'vitest';
import { executeToolCall } from './registry.js';
import { actionGate } from '../services/actionGate.js';
import { setCommandProvider, LocalCommandProvider, type CommandProvider } from '../services/commandProvider.js';
import './selfModify.js';

describe('self_modify 自我修改技能', () => {
  beforeEach(() => {
    for (const item of actionGate.list()) actionGate.deny(item.id);
  });

  it('高风险需确认；确认后委派 codex exec', async () => {
    let captured = '';
    const fake: CommandProvider = {
      run: () => ({ stdout: '', stderr: '', exitCode: 0 }),
      runAsync: async (command) => {
        captured = command;
        return { stdout: 'codex done', stderr: '', exitCode: 0, timedOut: false };
      },
    };
    setCommandProvider(fake);

    try {
      const first = await executeToolCall('self_modify', { task: '把 README 改一下' });
      expect(first).toContain('需要你确认');

      const pending = actionGate.getLatest()!;
      const result = await pending.executor!(pending.args);
      expect(result).toContain('codex exit=0');
      expect(result).toContain('codex done');
      expect(captured).toContain('codex exec');
      expect(captured).toContain('- < "');
      actionGate.deny(pending.id);
    } finally {
      setCommandProvider(new LocalCommandProvider());
    }
  });
});
