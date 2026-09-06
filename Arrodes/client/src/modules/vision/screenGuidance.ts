import type { VisionObservation } from './continuousVision';

export type GuidanceDecision = 'advance' | 'wait' | 'blocked' | 'ask';

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function applyScreenGuidancePolicy(observation: VisionObservation): VisionObservation {
  const visible = observation.visibleText || [];
  const evidenceText = visible.join('\n');
  const application = observation.activeApplication || '';
  const isArduinoIde = /arduino/i.test(application)
    || includesAny(evidenceText, [/arduino uno/i, /LED_BUILTIN/i, /Sketch uses \d+ bytes/i]);

  if (!isArduinoIde) {
    const uncertain = (observation.uncertainties?.length || 0) > 0
      || observation.confidence === null
      || observation.confidence === undefined
      || observation.confidence < 0.55;
    return {
      ...observation,
      currentStep: observation.currentState || observation.userActivity || null,
      expectedEvidence: [],
      decision: uncertain ? 'ask' : observation.nextSuggestion ? 'advance' : 'wait',
      nextAction: uncertain ? null : observation.nextSuggestion || null,
      guidanceProfile: null,
    };
  }

  if (includesAny(evidenceText, [/\berror\b/i, /exit status [1-9]/i, /compilation error/i, /编译失败/])) {
    return {
      ...observation,
      currentState: '编译失败',
      nextSuggestion: '先查看输出面板中的第一条 error，并修正代码后重新编译。',
      currentStep: '编译失败',
      expectedEvidence: ['Done compiling.'],
      decision: 'blocked',
      nextAction: '先查看输出面板中的第一条 error，并修正代码后重新编译。',
      guidanceProfile: 'arduino-ide',
    };
  }

  if (includesAny(evidenceText, [/Done uploading\.?/i, /上传成功/])) {
    return {
      ...observation,
      currentState: 'Blink 已上传到开发板',
      nextSuggestion: '屏幕侧上传已完成；下一阶段再用摄像头验证板载 LED 是否每秒亮灭一次。',
      currentStep: 'Blink 已上传到开发板',
      expectedEvidence: ['摄像头画面中板载 LED 每秒亮灭一次'],
      decision: 'advance',
      nextAction: '屏幕侧上传已完成；下一阶段再用摄像头验证板载 LED 是否每秒亮灭一次。',
      guidanceProfile: 'arduino-ide',
    };
  }

  if (includesAny(evidenceText, [/Done compiling\.?/i, /编译完成/])) {
    return {
      ...observation,
      currentState: 'Blink 编译已完成',
      nextSuggestion: '点击上传按钮，将 Blink 写入当前选择的 Arduino 开发板。',
      currentStep: 'Blink 编译已完成',
      expectedEvidence: ['Done uploading.'],
      decision: 'advance',
      nextAction: '点击上传按钮，将 Blink 写入当前选择的 Arduino 开发板。',
      guidanceProfile: 'arduino-ide',
    };
  }

  return {
    ...observation,
    currentStep: observation.currentState || '等待 Arduino IDE 输出',
    expectedEvidence: ['Done compiling. 或第一条编译错误'],
    decision: 'wait',
    nextAction: null,
    guidanceProfile: 'arduino-ide',
  };
}
