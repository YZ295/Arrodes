import { describe, expect, it, vi } from 'vitest';
import * as continuousVision from './continuousVision';

const { ContinuousVisionSampler, measureSceneDifference, fetchWithTimeout } = continuousVision;

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

// 该模块并未被 mock，导出一定存在；这里只是绕开 vitest 的模块命名空间类型推断
const parseScreenObservation = (continuousVision as unknown as {
  parseScreenObservation: ParseScreenObservation;
}).parseScreenObservation;

describe('推理请求超时（防观察循环静默停摆）', () => {
  it('正常返回时原样透传响应，且不留悬挂定时器', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await fetchWithTimeout('/api/x', { method: 'POST' }, 1_000, '超时');

    expect(response.status).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('请求挂住时按超时中断，抛出可读原因而不是永远等待', async () => {
    // 真实故障：视觉推理偶发不返回。采样器用 inFlight 闩锁防并发，
    // 没有超时的话这个闩锁永远解不开，观察循环从此静默停摆——
    // 面板还显示"观察中"，却再也不更新，也不报错。
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    })));

    const pending = fetchWithTimeout('/api/x', { method: 'POST' }, 1_000, '视觉分析超时');
    const assertion = expect(pending).rejects.toThrow('视觉分析超时');
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('非超时错误原样抛出，不被改写成超时', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('视觉服务 503')));

    await expect(fetchWithTimeout('/api/x', {}, 1_000, '视觉分析超时')).rejects.toThrow('视觉服务 503');

    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});

describe('采样结果上报（让观察循环是否在跑可被观察）', () => {
  const frame = (fingerprint: number[]) => ({
    imageBase64: 'png-data',
    fingerprint: new Uint8Array(fingerprint),
  });

  it('按原因上报：分析了 / 画面没变 / 播报中', async () => {
    const outcomes: string[] = [];
    const sampler = new ContinuousVisionSampler({
      analyze: vi.fn().mockResolvedValue({ description: 'x', durationMs: 1, model: 'm' }),
      onOutcome: (outcome) => outcomes.push(outcome),
    });

    await sampler.sample(frame([10, 20, 30]), false);
    await sampler.sample(frame([10, 20, 30]), false);   // 没变化
    await sampler.sample(frame([200, 200, 200]), true); // 播报中

    expect(outcomes).toEqual(['analyzed', 'skipped-unchanged', 'skipped-speaking']);
  });

  it('推理失败时上报失败原因，下一帧仍可重试', async () => {
    const outcomes: string[] = [];
    const analyze = vi.fn()
      .mockRejectedValueOnce(new Error('视觉分析超时'))
      .mockResolvedValue({ description: '恢复', durationMs: 1, model: 'm' });
    const sampler = new ContinuousVisionSampler({ analyze, onOutcome: (o) => outcomes.push(o) });

    // 失败向上抛（调用方负责 setError），但闩锁必须解开，同一画面才能重试
    await expect(sampler.sample(frame([10, 20, 30]), false)).rejects.toThrow('视觉分析超时');
    await expect(sampler.sample(frame([10, 20, 30]), false)).resolves.toMatchObject({ description: '恢复' });

    expect(outcomes).toEqual(['failed', 'analyzed']);
  });
});

describe('continuous vision scene policy', () => {
  it('treats identical fingerprints as unchanged and opposite frames as fully changed', () => {
    expect(measureSceneDifference(new Uint8Array([0, 64, 255]), new Uint8Array([0, 64, 255]))).toBe(0);
    expect(measureSceneDifference(new Uint8Array([0, 0]), new Uint8Array([255, 255]))).toBe(100);
  });

  it('catches a local change that a full-frame average would wash out', () => {
    // 真机场景：IDE 输出面板只换两行编译结果，摊到全屏平均不足 3%，
    // 旧算法会因此漏掉「编译失败」这种关键变化。
    const before = new Uint8Array(2304);
    const after = before.slice();
    for (let i = 2200; i < 2264; i += 1) after[i] = 255;

    expect(measureSceneDifference(before, after)).toBeGreaterThan(10);
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
      structuredFallback: true,
    });
  });

  it('does not mark a successful structured parse as degraded', () => {
    expect(typeof parseScreenObservation).toBe('function');
    if (!parseScreenObservation) return;

    const observation = parseScreenObservation(
      '{"summary":"Arduino IDE 正在编译","visibleText":["Compiling sketch"],"confidence":0.8}',
      { durationMs: 10, model: 'mage' },
      '2026-09-06T12:00:00.000Z',
    );

    expect(observation.structuredFallback).toBeFalsy();
    expect(observation.visibleText).toEqual(['Compiling sketch']);
  });

  it('marks malformed JSON as degraded and keeps the raw text', () => {
    expect(typeof parseScreenObservation).toBe('function');
    if (!parseScreenObservation) return;

    const raw = '{"summary": "缺少右花括号的开头';
    const observation = parseScreenObservation(
      raw,
      { durationMs: 10, model: 'mage' },
      '2026-09-06T12:00:00.000Z',
    );

    expect(observation.structuredFallback).toBe(true);
    expect(observation.description).toBe(raw);
    expect(observation.visibleText).toEqual([]);
  });

  it('recovers fields when the model leaves quotes unescaped inside a value', () => {
    // 真实观测到的错误：模型在 summary 里复述画面内容时用了裸引号，导致整个 JSON 非法
    const broken = '{"summary":"画面显示 "exit status 1" 与 expected \';\' before \'}\' token","visibleText":["Arduino Uno","exit status 1"],"confidence":0.7}';
    const observation = parseScreenObservation(broken, { durationMs: 30, model: 'qwen3-vl' });

    expect(observation.description).toContain('exit status 1');
    expect(observation.uncertainties).not.toContain('视觉模型未返回结构化字段');
    // 关键：修复之后规则照常生效，而不是因为少一个转义符就失去判断能力
    expect(observation.guidanceProfile).toBe('arduino-ide');
    expect(observation.currentStep).toBe('编译失败');
  });

  it('keeps evidence that arrives late in the model list instead of truncating it away', () => {
    // 真实观测：模型先列了 9 条代码行，编译输出排在第 11 条，之前的上限 8 会把它切掉
    const items = Array.from({ length: 12 }, (_, i) => `代码行 ${i + 1}`);
    items[10] = 'Sketch uses 924 bytes of program storage space.';
    const observation = parseScreenObservation(
      JSON.stringify({ summary: 'Arduino IDE 正在编译', visibleText: items, confidence: 0.9 }),
      { durationMs: 30, model: 'qwen3-vl' },
    );

    expect(observation.visibleText).toContain('Sketch uses 924 bytes of program storage space.');
    expect(observation.guidanceProfile).toBe('arduino-ide');
  });

  it('treats the compile statistics line as completion evidence for Arduino IDE 2.x', () => {
    // 真机场景：IDE 2.x 编译成功后输出面板只留统计行，看不到 Done compiling.
    const observation = parseScreenObservation(
      JSON.stringify({
        summary: 'Arduino IDE 已经编译完成',
        visibleText: [
          'Arduino Uno 在 COM5',
          'Sketch uses 924 bytes (2%) of program storage space. Maximum is 32256 bytes.',
        ],
        confidence: 0.98,
      }),
      { durationMs: 30, model: 'qwen3-vl' },
    );

    expect(observation.guidanceProfile).toBe('arduino-ide');
    expect(observation.currentStep).toBe('Blink 编译已完成');
    expect(observation.nextAction).toContain('点击上传按钮');
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
      { durationMs: 8464, model: 'qwen3-vl:4b-instruct' },
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
      { durationMs: 100, model: 'qwen3-vl:4b-instruct' },
    );

    expect(observation).toMatchObject({
      guidanceProfile: 'arduino-ide',
      currentStep: '编译失败',
      decision: 'blocked',
      nextAction: '先查看输出面板中的第一条 error，并修正代码后重新编译。',
    });
    expect(observation.expectedEvidence).toContain('Done compiling.');
  });

  it('separates an upload failure from a compile failure when the sketch compiled fine', () => {
    // 真实帧（2026-09-18 用户实测，Arduino IDE 2.3.10 + Arduino Uno）：
    // 编译统计正常输出，随后 COM5 打不开导致上传失败。
    // 这不是编译失败——代码是好的，让用户去改代码是误导。
    expect(typeof parseScreenObservation).toBe('function');
    if (!parseScreenObservation) return;

    const realFrame = {
      summary: 'Arduino IDE 编译统计正常，但上传因串口打不开失败',
      activeApplication: 'Arduino IDE',
      visibleText: [
        'Sketch uses 2004 bytes (6%) of program storage space. Maximum is 32256 bytes.',
        'Global variables use 188 bytes (6%) of dynamic memory, leaving 1860 bytes for local variables. Maximum is 2048 bytes.',
        'Error: cannot open port \\.\COM5',
        'Error: unable to open port COM5 for programmer arduino',
        'Failed uploading: uploading error: exit status 1',
      ],
      uncertainties: [],
      confidence: 0.9,
    };

    const observation = parseScreenObservation(
      JSON.stringify(realFrame),
      { durationMs: 12_300, model: 'qwen3-vl:4b-instruct' },
    );

    expect(observation).toMatchObject({
      guidanceProfile: 'arduino-ide',
      currentStep: '上传失败',
      decision: 'blocked',
    });
    // 代码没问题，绝不能给出「改代码」的下一步
    expect(observation.nextAction ?? '').not.toContain('修正代码');
    expect(observation.nextAction ?? '').toMatch(/端口|开发板|USB/);
  });

  it('does not treat a successful upload frame as an upload failure', () => {
    // 守门：新增的上传失败分支不能误伤正常成功帧
    expect(typeof parseScreenObservation).toBe('function');
    if (!parseScreenObservation) return;

    const realFrame = {
      summary: 'Arduino IDE 编译并上传成功',
      activeApplication: 'Arduino IDE',
      visibleText: [
        'Sketch uses 924 bytes (2%) of program storage space. Maximum is 32256 bytes.',
        'Global variables use 9 bytes (0%) of dynamic memory',
        'avrdude done. Thank you.',
        'Done uploading.',
      ],
      uncertainties: [],
      confidence: 0.9,
    };

    const observation = parseScreenObservation(
      JSON.stringify(realFrame),
      { durationMs: 9_000, model: 'qwen3-vl:4b-instruct' },
    );

    expect(observation.decision).toBe('advance');
    expect(observation.currentStep).not.toBe('上传失败');
    expect(observation.currentStep).not.toBe('编译失败');
  });

  it('still reports a compile failure as a code problem when no upload was attempted', () => {
    // 反向保护：把上传失败拆出去之后，真编译错误不能被漏判成上传问题
    expect(typeof parseScreenObservation).toBe('function');
    if (!parseScreenObservation) return;

    const realFrame = {
      summary: 'Arduino IDE 编译报错',
      activeApplication: 'Arduino IDE',
      visibleText: [
        'Blink.ino:5:3: error: setupp was not declared in this scope',
        'exit status 1',
        'Compilation error: setupp was not declared in this scope',
      ],
      uncertainties: [],
      confidence: 0.9,
    };

    const observation = parseScreenObservation(
      JSON.stringify(realFrame),
      { durationMs: 8_000, model: 'qwen3-vl:4b-instruct' },
    );

    expect(observation).toMatchObject({
      guidanceProfile: 'arduino-ide',
      currentStep: '编译失败',
      decision: 'blocked',
    });
    expect(observation.nextAction ?? '').toContain('修正代码');
  });
});
