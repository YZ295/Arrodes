import type { VisionObservation } from './continuousVision';

export type GuidanceDecision = 'advance' | 'wait' | 'blocked' | 'ask';

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * 上传阶段失败的特征。
 *
 * 必须与编译失败分开判：编译成功但串口打不开时，输出面板会**同时**出现
 * 编译统计行（`Sketch uses N bytes`）和 `exit status 1`——后者在编译失败里
 * 也出现，光看它无法区分。只有这些上传专有字样才是不歧义的证据。
 *
 * 判错的代价不对称：把上传失败说成编译失败，会让用户去改本来没问题的代码。
 */
const UPLOAD_FAILURE_PATTERNS = [
  /failed uploading/i,
  /uploading error/i,
  /unable to open port/i,
  /cannot open port/i,
  /can't open (device|port)/i,
  /ser_open\(\)/i,
  /programmer is not responding/i,
  /上传失败/,
];

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

  // 先判上传失败：此时代码往往已经编译通过，指引方向与编译错误完全不同
  if (includesAny(evidenceText, UPLOAD_FAILURE_PATTERNS)) {
    const advice = '开发板或串口没连上：确认 USB 线已插好、开发板已上电，'
      + '并在开发板选择器里选中正确端口后重新上传。代码本身没有问题，不用改。';
    return {
      ...observation,
      currentState: '上传失败',
      nextSuggestion: advice,
      currentStep: '上传失败',
      expectedEvidence: ['Done uploading.'],
      decision: 'blocked',
      nextAction: advice,
      guidanceProfile: 'arduino-ide',
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

  // Arduino IDE 2.x 编译成功后，输出面板通常只留统计行（Sketch uses N bytes），
  // 「Done compiling.」只在底部状态栏一闪而过，因此两者都算完成证据。
  if (includesAny(evidenceText, [/Done compiling\.?/i, /编译完成/, /Sketch uses \d+ bytes/i])) {
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
