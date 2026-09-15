import { describe, it, expect } from 'vitest';
import { Harness } from './harness.js';
import type { AgentDefinition } from './agent.js';

function makeAgent(id: string): AgentDefinition {
  return {
    id,
    name: id,
    description: 'test',
    temperature: 0,
    maxTokens: 10,
    run: async () => ({ reply: 'ok', failed: false }),
  };
}

describe('Harness 生命周期事件', () => {
  it('execute 发出 turn:start / turn:end', async () => {
    const harness = new Harness();
    harness.register(makeAgent('echo'));
    const events: string[] = [];
    const dispose = harness.on((e) => events.push(e.type));

    await harness.execute('echo', { sessionId: 's1', state: {} }, { content: 'hi', isVoice: false, history: [], memories: [] });

    expect(events).toEqual(['turn:start', 'turn:end']);
    dispose();
  });

  it('on 返回 disposer，off 后不再收到事件', async () => {
    const harness = new Harness();
    harness.register(makeAgent('echo2'));
    const events: string[] = [];
    const dispose = harness.on((e) => events.push(e.type));
    dispose();

    await harness.execute('echo2', { sessionId: 's2', state: {} }, { content: 'hi', isVoice: false, history: [], memories: [] });

    expect(events).toEqual([]);
  });
});
