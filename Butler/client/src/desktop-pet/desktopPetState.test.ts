import { describe, expect, it } from 'vitest';
import { createDesktopPetViewModel } from './desktopPetState';

describe('desktop pet presentation policy', () => {
  it('shows one grounded suggestion for a confident development observation', () => {
    const view = createDesktopPetViewModel({
      description: 'VS Code 正在编辑视觉模块',
      durationMs: 32,
      model: 'mage',
      activeApplication: 'Visual Studio Code',
      contextKind: 'development',
      currentState: '正在修改 continuousVision.ts',
      nextSuggestion: '先运行 continuousVision.test.ts',
      confidence: 0.86,
      uncertainties: [],
    }, { active: true, analyzing: false, error: null });

    expect(view).toMatchObject({
      title: 'Visual Studio Code',
      state: '正在修改 continuousVision.ts',
      action: '先运行 continuousVision.test.ts',
      tone: 'ready',
    });
  });

  it('suppresses advice when confidence is low and names the missing evidence', () => {
    const view = createDesktopPetViewModel({
      description: '可能是一个游戏界面',
      durationMs: 20,
      model: 'mage',
      contextKind: 'game',
      nextSuggestion: '立刻使用治疗药水',
      confidence: 0.34,
      uncertainties: ['角色血量数值看不清'],
    }, { active: true, analyzing: false, error: null });

    expect(view.action).toBeNull();
    expect(view.note).toContain('角色血量数值看不清');
    expect(view.tone).toBe('uncertain');
  });

  it('prefers concrete prompt feedback over a generic next step', () => {
    const view = createDesktopPetViewModel({
      description: '正在编辑提示词',
      durationMs: 20,
      model: 'mage',
      activeApplication: 'Codex',
      contextKind: 'prompt',
      currentState: '提示词缺少验收条件',
      nextSuggestion: '继续提交',
      promptFeedback: '补充输出格式和成功标准',
      confidence: 0.91,
      uncertainties: [],
    }, { active: true, analyzing: false, error: null });

    expect(view.action).toBe('补充输出格式和成功标准');
  });

  it('projects model, duration and observation time as diagnostics', () => {
    const view = createDesktopPetViewModel({
      description: 'VS Code 正在编辑视觉模块',
      durationMs: 1234,
      model: 'qwen3-vl:4b-instruct',
      observedAt: '2026-09-07T12:00:00.000Z',
      activeApplication: 'Visual Studio Code',
      contextKind: 'development',
      currentState: '正在修改 continuousVision.ts',
      confidence: 0.86,
      uncertainties: [],
    }, { active: true, analyzing: false, error: null });

    expect(view.diagnostics).toEqual({
      model: 'qwen3-vl:4b-instruct',
      durationMs: 1234,
      observedAt: '2026-09-07T12:00:00.000Z',
    });
  });

  it('keeps diagnostics null while there is no observation to project', () => {
    expect(createDesktopPetViewModel(null, { active: true, analyzing: false, error: null }).diagnostics).toBeNull();
    expect(createDesktopPetViewModel(null, { active: false, analyzing: false, error: null }).diagnostics).toBeNull();
    expect(createDesktopPetViewModel(null, { active: false, analyzing: true, error: null }).diagnostics).toBeNull();
  });

  it('prefers evidence-checked guidance over raw model state and advice', () => {
    const view = createDesktopPetViewModel({
      description: 'Arduino IDE', durationMs: 100, model: 'mage',
      activeApplication: 'Arduino IDE', contextKind: 'development', confidence: 0.8,
      currentState: '编译中', nextSuggestion: '等待编译完成', uncertainties: [],
      currentStep: 'Blink 编译已完成', expectedEvidence: ['Done uploading.'],
      decision: 'advance', nextAction: '点击上传按钮。', guidanceProfile: 'arduino-ide',
    }, { active: true, analyzing: false, error: null });

    expect(view.state).toBe('Blink 编译已完成');
    expect(view.action).toBe('点击上传按钮。');
    expect(view.note).toContain('Done uploading.');
  });

  it('projects the task verification so the pet can state whether the last step worked', () => {
    const base = {
      description: 'Arduino IDE', durationMs: 100, model: 'qwen3-vl',
      activeApplication: 'Arduino IDE', contextKind: 'development' as const, confidence: 0.8,
      currentStep: 'Blink 已上传到开发板', decision: 'advance' as const,
      nextAction: '下一阶段用摄像头验证板载 LED。',
    };

    const confirmed = createDesktopPetViewModel({
      ...base,
      task: {
        active: true, phase: 'advancing' as const, state: base.currentStep,
        nextAction: base.nextAction, observationCount: 2,
        verification: {
          result: 'confirmed' as const, expected: 'Done uploading.',
          basis: '画面中出现了上一步期望的「Done uploading.」，上一步已完成。',
        },
      },
    }, { active: true, analyzing: false, error: null });
    expect(confirmed.verification?.result).toBe('confirmed');
    expect(confirmed.verification?.text).toContain('上一步已完成');

    const failed = createDesktopPetViewModel({
      ...base,
      task: {
        active: true, phase: 'blocked' as const, state: '编译失败',
        nextAction: '修正代码后重新编译', observationCount: 2,
        verification: {
          result: 'failed' as const, expected: 'Done uploading.',
          basis: '上一步期望的「Done uploading.」没有出现，且画面显示了需要处理的错误。',
        },
      },
    }, { active: true, analyzing: false, error: null });
    expect(failed.verification?.result).toBe('failed');
    expect(failed.verification?.text).toContain('需要处理的错误');
  });

  it('reports no verification before the task has a previous step', () => {
    const view = createDesktopPetViewModel({
      description: 'Arduino IDE', durationMs: 100, model: 'qwen3-vl',
      activeApplication: 'Arduino IDE', contextKind: 'development', confidence: 0.8,
      currentStep: '等待 Arduino IDE 输出',
      task: {
        active: true, phase: 'observing' as const, state: '等待 Arduino IDE 输出',
        nextAction: null, observationCount: 1,
        verification: { result: 'none' as const, expected: null, basis: '这是本次任务的第一次观察，还没有上一步可验证。' },
      },
    }, { active: true, analyzing: false, error: null });
    expect(view.verification).toBeNull();
  });

  it('drops verification once the task is stopped', () => {
    const view = createDesktopPetViewModel({
      description: 'Arduino IDE', durationMs: 100, model: 'qwen3-vl',
      activeApplication: 'Arduino IDE', contextKind: 'development', confidence: 0.8,
    }, { active: false, analyzing: false, error: null });
    expect(view.verification).toBeNull();
  });
});

describe('观察新鲜度：面板必须如实说明这是什么时候看到的内容', () => {
  // 用户真实困惑：切到 WorkBuddy 后，面板仍显示 Arduino 的内容，
  // 且没有任何线索表明"这是旧内容"。根因是面板只持有最后一次观察，
  // 却把它呈现得像当前状态。
  const T0 = '2026-09-18T14:00:00.000Z';
  const at = (seconds: number) => Date.parse(T0) + seconds * 1000;
  const frame = { description: 'Arduino IDE 输出面板', durationMs: 100, model: 'qwen3-vl', observedAt: T0 };
  const observing = { active: true, analyzing: false, error: null };

  it('刚看到的算「刚刚」', () => {
    const view = createDesktopPetViewModel(frame, observing, at(20));
    expect(view.freshness).toEqual({ level: 'live', label: '刚刚' });
  });

  it('几分钟前的标明分钟数', () => {
    const view = createDesktopPetViewModel(frame, observing, at(3 * 60));
    expect(view.freshness).toEqual({ level: 'recent', label: '3 分钟前' });
  });

  it('超过五分钟明确提示可能已过期', () => {
    const view = createDesktopPetViewModel(frame, observing, at(12 * 60));
    expect(view.freshness.level).toBe('stale');
    expect(view.freshness.label).toContain('12 分钟前');
    expect(view.freshness.label).toContain('可能已过期');
  });

  it('观察已停止时直说停止，并交代上次是多久以前', () => {
    // 这正是用户遇到的情形：循环不跑了，界面却还在展示旧结论
    const view = createDesktopPetViewModel(frame, { active: false, analyzing: false, error: null }, at(4 * 60));
    expect(view.freshness.level).toBe('stopped');
    expect(view.freshness.label).toContain('观察已停止');
    expect(view.freshness.label).toContain('4 分钟前');
  });

  it('从未观察到过时只说停止，不编造时间', () => {
    const view = createDesktopPetViewModel(null, { active: false, analyzing: false, error: null }, at(600));
    expect(view.freshness).toEqual({ level: 'stopped', label: '观察已停止' });
  });

  it('观察中但还没有第一帧时说等待画面，而不是当成旧内容', () => {
    const view = createDesktopPetViewModel(null, observing, at(60));
    expect(view.freshness).toEqual({ level: 'live', label: '等待画面' });
  });

  it('观察中断的错误态也带上新鲜度，不留下无时间线索的面板', () => {
    const view = createDesktopPetViewModel(frame, { active: true, analyzing: false, error: '视觉分析超时' }, at(30));
    expect(view.freshness.level).toBe('live');
    expect(view.freshness.label).toBe('刚刚');
  });

  it('时间戳不可解析时不假装新鲜', () => {
    const broken = { ...frame, observedAt: 'not-a-date' };
    const view = createDesktopPetViewModel(broken, observing, at(30));
    expect(view.freshness).toEqual({ level: 'live', label: '等待画面' });
  });
});
