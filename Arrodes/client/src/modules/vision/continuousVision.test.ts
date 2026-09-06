import { describe, expect, it, vi } from 'vitest';
import * as continuousVision from './continuousVision';

const { ContinuousVisionSampler, measureSceneDifference } = continuousVision;

type ParseScreenObservation = (
  description: string,
  meta: { durationMs: number; model: string },
  observedAt?: string,
) => {
  description: string;
  activeApplication: string | null;
  userActivity: string | null;
  visibleText: string[];
  uncertainties: string[];
  contextKind: 'game' | 'development' | 'prompt' | 'general';
  currentState: string | null;
  nextSuggestion: string | null;
  promptFeedback: string | null;
  confidence: number | null;
  currentStep: string | null;
  expectedEvidence: string[];
  decision: 'advance' | 'wait' | 'blocked' | 'ask';
  nextAction: string | null;
  guidanceProfile: string | null;
  observedAt: string;
};

const parseScreenObservation = (continuousVision as unknown as {
  parseScreenObservation?: ParseScreenObservation;
}).parseScreenObservation;

describe('continuous vision scene policy', () => {
  it('treats identical fingerprints as unchanged and opposite frames as fully changed', () => {
    expect(measureSceneDifference(new Uint8Array([0, 64, 255]), new Uint8Array([0, 64, 255]))).toBe(0);
    expect(measureSceneDifference(new Uint8Array([0, 0]), new Uint8Array([255, 255]))).toBe(100);
  });

  it('analyzes the first frame, then skips an unchanged frame', async () => {
    const analyze = vi.fn().mockResolvedValue({ description: '设置窗口', durationMs: 12, model: 'mage' });
    const sampler = new ContinuousVisionSampler({ analyze, threshold: 6 });
    const frame = { imageBase64: 'png-data', fingerprint: new Uint8Array([10, 20, 30]) };

    await expect(sampler.sample(frame, false)).resolves.toMatchObject({ description: '设置窗口' });
    await expect(sampler.sample(frame, false)).resolves.toBeNull();
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it('does not analyze while speech is playing and accepts the frame afterwards', async () => {
    const analyze = vi.fn().mockResolvedValue({ description: '浏览器', durationMs: 8, model: 'mage' });
    const sampler = new ContinuousVisionSampler({ analyze, threshold: 6 });
    const frame = { imageBase64: 'png-data', fingerprint: new Uint8Array([255]) };

    await expect(sampler.sample(frame, true)).resolves.toBeNull();
    expect(analyze).not.toHaveBeenCalled();
    await expect(sampler.sample(frame, false)).resolves.toMatchObject({ description: '浏览器' });
  });

  it('keeps the previous successful scene when inference fails so the same frame can retry', async () => {
    const analyze = vi.fn()
      .mockResolvedValueOnce({ description: '桌面', durationMs: 8, model: 'mage' })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ description: '终端', durationMs: 8, model: 'mage' });
    const sampler = new ContinuousVisionSampler({ analyze, threshold: 6 });

    await sampler.sample({ imageBase64: 'a', fingerprint: new Uint8Array([0]) }, false);
    await expect(sampler.sample({ imageBase64: 'b', fingerprint: new Uint8Array([255]) }, false)).rejects.toThrow('offline');
    await expect(sampler.sample({ imageBase64: 'b', fingerprint: new Uint8Array([255]) }, false)).resolves.toMatchObject({ description: '终端' });
  });
});

describe('screen observation contract', () => {
  it('turns model JSON into a structured, timestamped screen observation', () => {
    expect(typeof parseScreenObservation).toBe('function');
    if (!parseScreenObservation) return;

    const observation = parseScreenObservation(
      '```json\n{"summary":"Arduino IDE 正在编译","activeApplication":"Arduino IDE","userActivity":"编译 Blink","visibleText":["Compiling sketch"],"uncertainties":["尚未看到上传结果"],"contextKind":"development","currentState":"Blink 正在编译","nextSuggestion":"等待编译结束后检查输出面板","promptFeedback":null,"confidence":0.82}\n```',
      { durationMs: 42, model: 'mage' },
      '2026-09-06T12:00:00.000Z',
    );

    expect(observation).toMatchObject({
      description: 'Arduino IDE 正在编译',
      activeApplication: 'Arduino IDE',
      userActivity: '编译 Blink',
      visibleText: ['Compiling sketch'],
      uncertainties: ['尚未看到上传结果'],
      contextKind: 'development',
      currentState: 'Blink 正在编译',
      nextSuggestion: '等待编译结束后检查输出面板',
      promptFeedback: null,
      confidence: 0.82,
      observedAt: '2026-09-06T12:00:00.000Z',
    });
  });

  it('keeps plain model output as a usable fallback instead of inventing fields', () => {
    expect(typeof parseScreenObservation).toBe('function');
    if (!parseScreenObservation) return;

    const observation = parseScreenObservation(
      '当前显示一个代码编辑器。',
      { durationMs: 10, model: 'mage' },
      '2026-09-06T12:00:00.000Z',
    );

    expect(observation).toMatchObject({
      description: '当前显示一个代码编辑器。',
      activeApplication: null,
      userActivity: null,
      visibleText: [],
      uncertainties: ['视觉模型未返回结构化字段'],
      contextKind: 'general',
      currentState: null,
      nextSuggestion: null,
      promptFeedback: null,
      confidence: null,
    });
  });

  it('rejects unsupported categories and clamps confidence to a probability', () => {
    expect(typeof parseScreenObservation).toBe('function');
    if (!parseScreenObservation) return;

    expect(parseScreenObservation(
      '{"summary":"窗口","contextKind":"finance","confidence":4}',
      { durationMs: 10, model: 'mage' },
    )).toMatchObject({ contextKind: 'general', confidence: 1 });
  });

  it('lets visible Arduino completion evidence override a contradictory model state', () => {
    expect(typeof parseScreenObservation).toBe('function');
    if (!parseScreenObservation) return;

    const observation = parseScreenObservation(
      '{"summary":"识别 Arduino IDE 当前状态","activeApplication":"Arduino IDE","userActivity":"未活动","visibleText":["Sketch uses 924 bytes","Done compiling."],"uncertainties":[],"contextKind":"development","currentState":"编译中","nextSuggestion":"等待编译完成","promptFeedback":null,"confidence":0.8}',
      { durationMs: 8464, model: 'Mage-VL' },
    );

    expect(observation).toMatchObject({
      guidanceProfile: 'arduino-ide',
      currentStep: 'Blink 编译已完成',
      expectedEvidence: ['Done uploading.'],
      decision: 'advance',
      nextAction: '点击上传按钮，将 Blink 写入当前选择的 Arduino 开发板。',
      currentState: 'Blink 编译已完成',
      nextSuggestion: '点击上传按钮，将 Blink 写入当前选择的 Arduino 开发板。',
    });
  });

  it('blocks Arduino progress on visible compiler errors instead of following model advice', () => {
    expect(typeof parseScreenObservation).toBe('function');
    if (!parseScreenObservation) return;

    const observation = parseScreenObservation(
      '{"summary":"Arduino IDE","activeApplication":"Arduino IDE","visibleText":["error: expected ; before }","exit status 1"],"uncertainties":[],"contextKind":"development","currentState":"准备上传","nextSuggestion":"点击上传","confidence":0.9}',
      { durationMs: 100, model: 'Mage-VL' },
    );

    expect(observation).toMatchObject({
      guidanceProfile: 'arduino-ide',
      currentStep: '编译失败',
      decision: 'blocked',
      nextAction: '先查看输出面板中的第一条 error，并修正代码后重新编译。',
    });
    expect(observation.expectedEvidence).toContain('Done compiling.');
  });
});
