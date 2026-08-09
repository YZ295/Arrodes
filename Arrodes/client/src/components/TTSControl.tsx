/**
 * TTS 控制面板
 * 音色切换（预设 + 自定义）/ 语速 / 音调（本地 CosyVoice 合成）
 */
import { useState, useEffect, useRef } from 'react';
import type { TtsVoice } from '../voice/hooks/useTTS';

/* ============================================================
 * 自定义音色（T9）：上传参考音频克隆音色
 * ============================================================ */
interface CustomVoice {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

/* ============================================================
 * TTSControl — 主面板
 * ============================================================ */
interface TTSControlProps {
  currentVoice: string;
  rate: number;
  pitch: number;
  onVoiceChange: (voiceId: string) => void;
  onRateChange: (rate: number) => void;
  onPitchChange: (pitch: number) => void;
}

export default function TTSControl({
  currentVoice,
  rate,
  pitch,
  onVoiceChange,
  onRateChange,
  onPitchChange,
}: TTSControlProps) {
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [customVoices, setCustomVoices] = useState<CustomVoice[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 加载预设音色 + 自定义音色
  useEffect(() => {
    fetch('/api/v1/tts/voices')
      .then((r) => r.json())
      .then((data) => {
        if (data.voices) setVoices(data.voices);
      })
      .catch(() => {});
    loadCustomVoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCustomVoices = () => {
    fetch('/api/v1/tts/custom-voices')
      .then((r) => r.json())
      .then((data) => {
        if (data.voices) setCustomVoices(data.voices);
      })
      .catch(() => {});
  };

  // 上传参考音频创建自定义音色
  const handleUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const name = file.name.replace(/\.(wav|mp3|ogg|flac)$/i, '').slice(0, 30) || '自定义音色';
      const form = new FormData();
      form.append('audio', file);
      form.append('name', name);
      const res = await fetch('/api/v1/tts/custom-voices', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');
      loadCustomVoices();
      setUploadMsg(`✅ 音色「${data.voice.name}」已创建`);
    } catch (err) {
      setUploadMsg(`❌ ${err instanceof Error ? err.message : '上传失败'}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/v1/tts/custom-voices/${id}`, { method: 'DELETE' });
      loadCustomVoices();
    } catch { /* ignore */ }
  };

  // 合并显示：自定义音色在前，预设音色在后
  const allVoiceOptions = [
    ...customVoices.map((v) => ({
      id: `custom:${v.id}`,
      name: `🎙 ${v.name}`,
      style: '自定义克隆音色',
    })),
    ...voices.map((v) => ({ id: v.id, name: v.name, style: v.style })),
  ];

  return (
    <div className="px-3 py-2 space-y-3">
      {/* 音色选择（预设 + 自定义） */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[16px] text-gray-500">音色 (本地 CosyVoice)</label>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-[16px] px-2 py-0.5 rounded bg-[var(--color-home-gold)]/20 text-[var(--color-home-gold)] hover:bg-[var(--color-home-gold)]/30 transition-colors disabled:opacity-40"
            title="上传参考音频（3-10 秒人声）克隆专属音色"
          >
            {uploading ? '上传中…' : '🎙 上传音色'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/wav,audio/mpeg,audio/ogg,audio/flac,.wav,.mp3,.ogg,.flac"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
        </div>
        {uploadMsg && <p className="text-[16px] text-gray-400 mb-1.5">{uploadMsg}</p>}
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {allVoiceOptions.map((v) => (
            <button
              key={v.id}
              onClick={() => onVoiceChange(v.id)}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[16px] transition-colors flex items-center gap-2 group ${
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
                <span className="text-[16px] text-gray-500">{v.style}</span>
              </div>
              {v.id.startsWith('custom:') && (
                <span
                  role="button"
                  onClick={(e) => handleDelete(v.id.replace('custom:', ''), e)}
                  className="text-[16px] text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  title="删除音色"
                >
                  ✕
                </span>
              )}
            </button>
          ))}
          {allVoiceOptions.length === 0 && (
            <div className="text-[16px] text-gray-500 text-center py-2">加载音色中...</div>
          )}
        </div>
      </div>

      {/* 语速 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[16px] text-gray-500">语速</label>
          <span className="text-[16px] text-gray-400">{rate.toFixed(1)}x</span>
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
          <label className="text-[16px] text-gray-500">音调</label>
          <span className="text-[16px] text-gray-400">{pitch.toFixed(1)}x</span>
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
