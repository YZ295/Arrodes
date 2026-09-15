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
