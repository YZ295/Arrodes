import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import StatusBar from './StatusBar';

const props = {
  isConnected: true, isSpeaking: false, error: null, ttsError: null,
  uiHidden: false, isMuted: false, onToggleUi: vi.fn(), onToggleMuted: vi.fn(), onReplayTTS: vi.fn(),
};

describe('StatusBar', () => {
  it('announces status and contains wake guidance in normal flow', () => {
    const html = renderToStaticMarkup(<StatusBar {...props} wakeListening />);
    expect(html).toContain('role="status"');
    expect(html).toContain('唤醒词已开启');
  });

  it('renders a TTS retry action without duplicating its error', () => {
    const html = renderToStaticMarkup(<StatusBar {...props} ttsError="播报失败" />);
    expect(html.match(/>播报失败</g)).toHaveLength(1);
    expect(html).toContain('重新播报');
  });
});
