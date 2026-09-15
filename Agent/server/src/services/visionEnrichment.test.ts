import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 屏幕观察增强服务测试
 * 通过 vi.resetModules + 环境变量/config 操控，mock 全局 fetch 模拟 DeepSeek 响应。
 */

type EnrichFn = (description: string) => Promise<string>;

const loadEnrich = async (): Promise<EnrichFn> => {
  const mod = await import('./visionEnrichment.js');
  return mod.enrichScreenObservation;
};

const stubFetch = (payload: unknown, ok = true) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  }));
};

const OBSERVATION = '{"summary":"微信聊天界面显示多个群聊对话","visibleText":["365娱乐"],"uncertainties":[],"confidence":0.9}';
const ENRICHED = '{"activeApplication":"微信","userActivity":"浏览群聊消息","contextKind":"general","currentState":null,"nextSuggestion":null}';

describe('visionEnrichment', () => {
  it('does not transmit observations when enrichment was not explicitly enabled', async () => {
    vi.stubEnv('VISION_ENRICHMENT', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect((await loadEnrich())(OBSERVATION)).resolves.toBe(OBSERVATION);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key-1234567890');
    vi.stubEnv('DEEPSEEK_MODEL', 'deepseek-v4-flash');
    vi.stubEnv('VISION_ENRICHMENT', 'on');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('merges DeepSeek inferred fields into the base observation JSON', async () => {
    stubFetch({ choices: [{ message: { content: ENRICHED } }] });
    const enrich = await loadEnrich();

    const out = await enrich(OBSERVATION);
    const parsed = JSON.parse(out) as Record<string, unknown>;

    expect(parsed.summary).toBe('微信聊天界面显示多个群聊对话');
    expect(parsed.visibleText).toEqual(['365娱乐']);
    expect(parsed.activeApplication).toBe('微信');
    expect(parsed.contextKind).toBe('general');
  });

  it('returns the original description when the model output is not screen observation JSON', async () => {
    const enrich = await loadEnrich();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const plain = '一张普通的风景图，有山和湖。';
    await expect(enrich(plain)).resolves.toBe(plain);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns the original description when DeepSeek is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const enrich = await loadEnrich();

    await expect(enrich(OBSERVATION)).resolves.toBe(OBSERVATION);
  });

  it('returns the original description when enrichment output is unparseable', async () => {
    stubFetch({ choices: [{ message: { content: '抱歉，我无法判断。' } }] });
    const enrich = await loadEnrich();

    await expect(enrich(OBSERVATION)).resolves.toBe(OBSERVATION);
  });

  it('skips enrichment entirely when VISION_ENRICHMENT=off', async () => {
    vi.stubEnv('VISION_ENRICHMENT', 'off');
    const enrich = await loadEnrich();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(enrich(OBSERVATION)).resolves.toBe(OBSERVATION);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
