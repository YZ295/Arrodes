/**
 * TTS 控制面板
 * 音色切换 / 语速 / 音调 / 引擎选择
 *
 * 集成在 VoiceDialog 的设置下拉中
 */
import { useState, useEffect } from 'react';
import type { TtsVoice } from '../voice/hooks/useTTS';

/* ============================================================
 * TTSControl — 主面板
 * ============================================================ */
interface TTSControlProps {
  currentVoice: string;
  rate: number;
  pitch: number;
  engine: 'server' | 'web';
  onVoiceChange: (voiceId: string) => void;
  onRateChange: (rate: number) => void;
  onPitchChange: (pitch: number) => void;
  onEngineChange: (engine: 'server' | 'web') => void;
}

export default function TTSControl({
  currentVoice,
  rate,
  pitch,
  engine,
  onVoiceChange,
  onRateChange,
  onPitchChange,
  onEngineChange,
}: TTSControlProps) {
  const [voices, setVoices] = useState<TtsVoice[]>([]);

  useEffect(() => {
    fetch('/api/v1/tts/voices')
      .then((r) => r.json())
      .then((data) => {
        if (data.voices) setVoices(data.voices);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="px-3 py-2 space-y-3">
      {/* 引擎选择 */}
      <div>
        <label className="text-[10px] text-gray-500 block mb-1">TTS 引擎</label>
        <div className="flex gap-1">
          {(['server', 'web'] as const).map((e) => (
            <button
              key={e}
              onClick={() => onEngineChange(e)}
              className={`flex-1 text-[11px] py-1.5 rounded-lg transition-colors ${
                engine === e
                  ? 'bg-[var(--color-home-gold)]/20 text-[var(--color-home-gold)] border border-[var(--color-home-gold)]/30'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-transparent'
              }`}
            >
              {e === 'server' ? 'Edge TTS (云端)' : 'Web Speech (本地)'}
            </button>
          ))}
        </div>
      </div>

      {/* 音色选择 */}
      <div>
        <label className="text-[10px] text-gray-500 block mb-1.5">音色</label>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {voices.map((v) => (
            <button
              key={v.id}
              onClick={() => onVoiceChange(v.id)}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 ${
                currentVoice === v.id
                  ? 'bg-[var(--color-home-gold)]/10 text-[var(--color-home-gold)]'
                  : 'text-gray-300 hover:bg-white/5'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                currentVoice === v.id ? 'bg-[var(--color-home-gold)]' : 'bg-white/15'
              }`} />
              <div className="flex-1 min-w-0">
                <span className="truncate block">{v.name}</span>
                <span className="text-[9px] text-gray-500">{v.style}</span>
              </div>
            </button>
          ))}
          {voices.length === 0 && (
            <div className="text-[10px] text-gray-500 text-center py-2">加载音色中...</div>
          )}
        </div>
      </div>

      {/* 语速 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-gray-500">语速</label>
          <span className="text-[10px] text-gray-400">{rate.toFixed(1)}x</span>
        </div>
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.1"
          value={rate}
          onChange={(e) => onRateChange(parseFloat(e.target.value))}
          className="w-full h-1 appearance-none rounded-full bg-white/10 outline-none
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--color-home-gold)]
            [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>

      {/* 音调 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-gray-500">音调</label>
          <span className="text-[10px] text-gray-400">{pitch.toFixed(1)}x</span>
        </div>
        <input
          type="range"
          min="0.5"
          max="1.5"
          step="0.1"
          value={pitch}
          onChange={(e) => onPitchChange(parseFloat(e.target.value))}
          className="w-full h-1 appearance-none rounded-full bg-white/10 outline-none
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--color-home-gold)]
            [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>
    </div>
  );
}
