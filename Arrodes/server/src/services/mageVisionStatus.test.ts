import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Mage-VL status contract', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VISION_PROVIDER', 'magevl');
    vi.stubEnv('MAGEVL_SIDECAR_URL', 'http://127.0.0.1:12345/');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it.each(['ready', 'ok'])('reports %s without loading the model, with a bounded health request', async (state) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ status: state, model: 'local/mage', device: 'cuda' }));
    vi.stubGlobal('fetch', fetchMock);
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { checkVisionModel } = await import('./visionService.js');
    expect(await checkVisionModel()).toMatchObject({ available: true, provider: 'magevl', model: 'local/mage', state, device: 'cuda' });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:12345/health', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(timeout).toHaveBeenCalledWith(5000);
  });

  it.each([{}, { status: 'error' }, null])('rejects a malformed or unhealthy response: %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
    const { checkVisionModel } = await import('./visionService.js');
    expect(await checkVisionModel()).toMatchObject({ available: false, provider: 'magevl' });
  });

  it.each(['connection refused', 'The operation was aborted due to timeout'])('returns Windows recovery steps for %s', async (message) => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(message)));
    const { checkVisionModel } = await import('./visionService.js');
    const status = await checkVisionModel();
    expect(status.available).toBe(false);
    expect(status.error).toContain('start-magevl.ps1');
    expect(status.error).toContain('MAGEVL_SIDECAR_URL');
    expect(status.error).toContain('12345');
  });
});
