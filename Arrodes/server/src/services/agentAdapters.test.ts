import { describe, it, expect } from 'vitest';
import { AgentAdapterRegistry, CodexCliAdapter, HermesCliAdapter } from './agentAdapters.js';
import { setCommandProvider, LocalCommandProvider, type CommandProvider } from './commandProvider.js';

describe('AgentAdapterRegistry（T-02 对话适配）', () => {
  const registry = new AgentAdapterRegistry();

  it('注册 / 获取 / disposer 撤销', () => {
    const adapter = new CodexCliAdapter();
    const dispose = registry.register('codex', adapter);
    expect(registry.get('codex')).toBe(adapter);
    dispose();
    expect(registry.get('codex')).toBeUndefined();
  });

  it('CodexCliAdapter 组装 codex exec 命令并返回回复', async () => {
    let captured = '';
    const fake: CommandProvider = {
      run: () => ({ stdout: '', stderr: '', exitCode: 0 }),
      runAsync: async (command) => {
        captured = command;
        return { stdout: 'codex reply', stderr: '', exitCode: 0, timedOut: false };
      },
    };
    setCommandProvider(fake);
    try {
      const adapter = new CodexCliAdapter();
      const reply = await adapter.run('改一下 README', { cwd: 'E:/x' });
      expect(captured).toContain('codex exec');
      expect(captured).toContain('-C "E:/x"');
      expect(reply).toContain('codex reply');
    } finally {
      setCommandProvider(new LocalCommandProvider());
    }
  });

  it('HermesCliAdapter 组装 hermes -z 命令并返回回复', async () => {
    let captured = '';
    const fake: CommandProvider = {
      run: () => ({ stdout: '', stderr: '', exitCode: 0 }),
      runAsync: async (command) => {
        captured = command;
        return { stdout: 'hermes reply', stderr: '', exitCode: 0, timedOut: false };
      },
    };
    setCommandProvider(fake);
    try {
      const adapter = new HermesCliAdapter();
      const reply = await adapter.run('总结一下', { cwd: 'E:/x' });
      expect(captured).toContain('hermes -z');
      expect(reply).toContain('hermes reply');
    } finally {
      setCommandProvider(new LocalCommandProvider());
    }
  });

  it('HermesCliAdapter 转义 cmd 特殊字符（% ! ^）', async () => {
    let captured = '';
    const fake: CommandProvider = {
      run: () => ({ stdout: '', stderr: '', exitCode: 0 }),
      runAsync: async (command) => {
        captured = command;
        return { stdout: 'ok', stderr: '', exitCode: 0, timedOut: false };
      },
    };
    setCommandProvider(fake);
    try {
      const adapter = new HermesCliAdapter();
      await adapter.run('进度 50% 且 !注意^', { cwd: 'E:/x' });
      expect(captured).toContain('50^%');
      expect(captured).toContain('^!');
      expect(captured).toContain('^^');
    } finally {
      setCommandProvider(new LocalCommandProvider());
    }
  });
});
