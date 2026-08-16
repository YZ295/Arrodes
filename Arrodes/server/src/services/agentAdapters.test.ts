import { describe, it, expect } from 'vitest';
import { AgentAdapterRegistry, CodexCliAdapter, HermesCliAdapter, ConfigCliAdapter } from './agentAdapters.js';
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

  it('HermesCliAdapter 组装 hermes chat -q -Q 命令并返回回复', async () => {
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
      expect(captured).toContain('hermes chat -q');
      expect(captured).toContain('-Q');
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

  it('超时/中止时显式报告，而不是「无输出 exit=null」', async () => {
    let captured = '';
    const fake: CommandProvider = {
      run: () => ({ stdout: '', stderr: '', exitCode: 0 }),
      runAsync: async (command) => {
        captured = command;
        return { stdout: '', stderr: 'git sync 卡住', exitCode: null, timedOut: true };
      },
    };
    setCommandProvider(fake);
    try {
      const adapter = new CodexCliAdapter();
      const reply = await adapter.run('改一下 README', { cwd: 'E:/x' });
      expect(reply).toContain('超时');
      expect(reply).toContain('git sync 卡住');
      expect(captured).toContain('codex exec');
    } finally {
      setCommandProvider(new LocalCommandProvider());
    }
  });

  it('无 stdout 但 stderr 有内容时透出诊断信息', async () => {
    const fake: CommandProvider = {
      run: () => ({ stdout: '', stderr: '', exitCode: 0 }),
      runAsync: async () => ({ stdout: '', stderr: 'MCP github 未配置', exitCode: 1, timedOut: false }),
    };
    setCommandProvider(fake);
    try {
      const adapter = new HermesCliAdapter();
      const reply = await adapter.run('hi', { cwd: 'E:/x' });
      expect(reply).toContain('MCP github 未配置');
    } finally {
      setCommandProvider(new LocalCommandProvider());
    }
  });

  it('ConfigCliAdapter 组装 command args "<task>" 并返回回复', async () => {
    let captured = '';
    const fake: CommandProvider = {
      run: () => ({ stdout: '', stderr: '', exitCode: 0 }),
      runAsync: async (command) => {
        captured = command;
        return { stdout: 'dsh reply', stderr: '', exitCode: 0, timedOut: false };
      },
    };
    setCommandProvider(fake);
    try {
      const adapter = new ConfigCliAdapter({ command: 'E:/AI/Deep Seek Harness/node_modules/.bin/dsh.cmd', args: ['--profile', 'headless'], name: 'DeepSeek Harness' });
      const reply = await adapter.run('总结一下', { cwd: 'E:/x' });
      expect(captured).toContain('dsh.cmd');
      expect(captured).toContain('--profile headless');
      expect(captured).toContain('总结一下');
      expect(reply).toContain('dsh reply');
    } finally {
      setCommandProvider(new LocalCommandProvider());
    }
  });
});
