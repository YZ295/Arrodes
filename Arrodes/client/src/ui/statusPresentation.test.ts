import { describe, expect, it } from 'vitest';
import { getStatusPresentation } from './statusPresentation';

describe('getStatusPresentation', () => {
  it('shows one actionable application error ahead of TTS state', () => {
    expect(getStatusPresentation({ connected: true, speaking: true, error: '发送失败', ttsError: '播报失败' })).toEqual({
      label: '发送失败', tone: 'error', recoverableTts: false,
    });
  });

  it('exposes a TTS error as the single recoverable status', () => {
    expect(getStatusPresentation({ connected: true, speaking: false, error: null, ttsError: '播报失败' })).toEqual({
      label: '播报失败', tone: 'error', recoverableTts: true,
    });
  });
});
