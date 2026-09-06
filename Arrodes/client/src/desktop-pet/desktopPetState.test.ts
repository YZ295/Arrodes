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
});
