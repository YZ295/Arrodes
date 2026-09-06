import { describe, it, expect, beforeEach } from 'vitest';
import { ActionGate, classifyAction, matchConfirmIntent, DEFAULT_RISK } from './actionGate.js';

function makeGate(now: () => number = () => 1000): ActionGate {
  return new ActionGate({ ttlMs: 5000, maxPending: 2, now });
}

describe('actionGate 分级授权', () => {
  beforeEach(() => {});

  it('低风险技能直接放行，不产生待确认', () => {
    const gate = makeGate();
    const out = gate.request('open_app', { name: 'notepad' }, '打开记事本');
    expect(out.risk).toBe('low');
    expect(out.pending).toBeNull();
    expect(gate.getLatest()).toBeNull();
  });

  it('高风险技能产生待确认项', () => {
    const gate = makeGate();
    const out = gate.request('type_text', { text: 'hello' }, '输入文本 hello');
    expect(out.risk).toBe('high');
    expect(out.pending).not.toBeNull();
    expect(gate.getLatest()?.skill).toBe('type_text');
  });

  it('未知技能默认高风险', () => {
    expect(classifyAction('mystery_tool')).toBe(DEFAULT_RISK);
    const gate = makeGate();
    expect(gate.request('mystery_tool', {}, '未知操作').risk).toBe('high');
  });

  it('confirm 返回并移除待确认项', () => {
    const gate = makeGate();
    const { pending } = gate.request('type_text', { text: 'x' }, '输入 x');
    expect(pending).not.toBeNull();
    const confirmed = gate.confirm(pending!.id);
    expect(confirmed?.id).toBe(pending!.id);
    expect(gate.getLatest()).toBeNull();
  });

  it('deny 移除待确认项', () => {
    const gate = makeGate();
    const { pending } = gate.request('send_hotkey', { keys: '^c' }, '发送 Ctrl+C');
    gate.deny(pending!.id);
    expect(gate.get(pending!.id)).toBeUndefined();
  });

  it('过期待确认项被清理', () => {
    let t = 1000;
    const gate = makeGate(() => t);
    const { pending } = gate.request('type_text', { text: 'x' }, '输入 x');
    t += 6000;
    expect(gate.get(pending!.id)).toBeUndefined();
    expect(gate.getLatest()).toBeNull();
  });

  it('队列满时拒绝新请求', () => {
    const gate = makeGate();
    gate.request('type_text', { text: 'a' }, 'a');
    gate.request('send_hotkey', { keys: '^c' }, 'b');
    expect(() => gate.request('close_window', { target: 'x' }, 'c')).toThrow(/队列已满/);
  });

  it('getLatest 返回最近一次待确认', () => {
    const gate = makeGate();
    const first = gate.request('type_text', { text: 'a' }, 'a').pending!;
    const second = gate.request('send_hotkey', { keys: '^c' }, 'b').pending!;
    expect(gate.getLatest()?.id).toBe(second.id);
    expect(first.id).not.toBe(second.id);
  });

  it('list 返回全部待确认', () => {
    const gate = makeGate();
    gate.request('type_text', { text: 'a' }, 'a');
    gate.request('send_hotkey', { keys: '^c' }, 'b');
    expect(gate.list().length).toBe(2);
  });

  it('executor 随待确认项保存，confirm 后可直通执行', async () => {
    const gate = makeGate();
    const calls: string[] = [];
    const { pending } = gate.request('type_text', { text: 'x' }, '输入 x', async () => {
      calls.push('executed');
      return 'done';
    });
    const item = gate.confirm(pending!.id);
    expect(item?.executor).toBeTypeOf('function');
    const confirmed = item as NonNullable<typeof item>;
    const result = await confirmed.executor!(confirmed.args);
    expect(result).toBe('done');
    expect(calls).toEqual(['executed']);
  });
});

describe('matchConfirmIntent', () => {
  it.each(['确认', '同意', '批准', '确认执行', '可以', '好的', '行', '执行', 'yes', 'ok'])(
    '匹配确认词 %s',
    (t) => {
      expect(matchConfirmIntent(t)).toBe('confirm');
    },
  );

  it.each(['取消', '拒绝', '不要', '算了', '不行', 'no'])('匹配拒绝词 %s', (t) => {
    expect(matchConfirmIntent(t)).toBe('deny');
  });

  it('普通对话不被误判', () => {
    expect(matchConfirmIntent('可以告诉我现在几点吗')).toBeNull();
    expect(matchConfirmIntent('确认一下服务器状态')).toBeNull();
    expect(matchConfirmIntent('取消闹钟')).toBeNull();
  });

  it('空白或超长文本返回 null', () => {
    expect(matchConfirmIntent('')).toBeNull();
    expect(matchConfirmIntent('   ')).toBeNull();
    expect(matchConfirmIntent('x'.repeat(31))).toBeNull();
  });
});
