/**
 * ttsLogic 纯逻辑测试：canReplay / replayAudio
 * 锁定 C6 修复：本地 wav 音频必须可重播（旧逻辑反向判断导致失效）
 */
import { describe, it, expect, vi } from 'vitest';
import { canReplay, replayAudio } from './ttsLogic.js';

describe('canReplay（C6 回归）', () => {
  it('wav 音频（本地 CosyVoice）可重播', () => {
    expect(canReplay({ src: 'data:audio/wav;base64,xxx' })).toBe(true);
  });

  it('mp3 音频（兼容旧数据）可重播', () => {
    expect(canReplay({ src: 'data:audio/mpeg;base64,xxx' })).toBe(true);
  });

  it('无 src 不可重播', () => {
    expect(canReplay({ src: '' })).toBe(false);
    expect(canReplay(null)).toBe(false);
    expect(canReplay(undefined)).toBe(false);
  });
});

describe('replayAudio', () => {
  it('有 src 时回到开头并播放，返回 true', () => {
    const audio = { src: 'data:audio/wav;base64,x', currentTime: 5, play: vi.fn(() => Promise.resolve()) } as unknown as HTMLAudioElement;
    const ok = replayAudio(audio);
    expect(ok).toBe(true);
    expect(audio.currentTime).toBe(0);
    expect(audio.play).toHaveBeenCalled();
  });

  it('无音频时返回 false 且不调用 play', () => {
    const play = vi.fn();
    const ok = replayAudio({ src: '', currentTime: 0, play } as unknown as HTMLAudioElement);
    expect(ok).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it('play 失败时调用 onError 回调', () => {
    const audio = { src: 'data:audio/wav;base64,x', currentTime: 0, play: vi.fn(() => Promise.reject(new Error('blocked'))) } as unknown as HTMLAudioElement;
    const onError = vi.fn();
    replayAudio(audio, onError);
    // play() 是异步 reject，需等微任务
    return Promise.resolve().then(() => expect(onError).toHaveBeenCalled());
  });
});
