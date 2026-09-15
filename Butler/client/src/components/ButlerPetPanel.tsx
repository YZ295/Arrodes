/**
 * 管家桌宠控制面板（挂在「管家」标签页下方，与 ButlerPanel 采集引擎并列）
 * - 启动/唤起管家桌宠窗口（Electron IPC；浏览器降级为开新窗口）
 * - 自定义形象上传（png/jpg/webp → /api/v1/butler-avatar）
 * - 形象切换（小球 / VRM / 自定义图片），经 BroadcastChannel 同步到桌宠窗口
 */
import { useEffect, useRef, useState } from 'react';
import { setPetAvatarMode } from '../desktop-pet/desktopPetBridge';

declare global {
  interface Window {
    arrodesButler?: {
      launchPet: () => Promise<{ created: boolean }>;
    };
  }
}

type AvatarMode = 'ball' | 'vrm' | 'image';

function currentAvatar(): AvatarMode {
  try {
    const v = localStorage.getItem('arrodes_pet_avatar');
    return v === 'vrm' || v === 'image' ? v : 'ball';
  } catch { return 'ball'; }
}

export function ButlerPetPanel() {
  const [launching, setLaunching] = useState(false);
  const [launchMsg, setLaunchMsg] = useState('');
  const [avatar, setAvatar] = useState<AvatarMode>(() => currentAvatar());
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  // 同步其他窗口的形象切换（如桌宠面板内切换）
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'arrodes_pet_avatar' && (e.newValue === 'ball' || e.newValue === 'vrm' || e.newValue === 'image')) {
        setAvatar(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const launchPet = async (): Promise<void> => {
    setLaunching(true);
    setLaunchMsg('');
    try {
      if (window.arrodesButler) {
        const r = await window.arrodesButler.launchPet();
        setLaunchMsg(r.created ? '管家已启动' : '管家已在运行，已为您聚焦窗口');
      } else {
        // 浏览器模式：开独立小窗（桌宠页面）
        window.open('/?surface=desktop-pet', 'arrodes-pet', 'width=660,height=600');
        setLaunchMsg('已在浏览器新窗口打开管家');
      }
    } catch (e) {
      setLaunchMsg(e instanceof Error ? e.message : String(e));
    }
    setLaunching(false);
  };

  const pickAvatar = (mode: AvatarMode): void => {
    setAvatar(mode);
    setPetAvatarMode(mode);
    try { localStorage.setItem('arrodes_pet_avatar', mode); } catch { /* 忽略 */ }
  };

  const onUpload = async (file: File): Promise<void> => {
    setUploading(true);
    setUploadMsg('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/v1/butler-avatar', { method: 'POST', body: form });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? '上传失败');
      pickAvatar('image');
      setUploadMsg('上传成功，已切换为自定义形象');
    } catch (e) {
      setUploadMsg(e instanceof Error ? e.message : String(e));
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <section className="bg-white/3 rounded-xl p-4 border border-white/5 space-y-3">
      <h3 className="text-[16px] text-white/30 uppercase tracking-wider">管家桌宠</h3>

      {/* 1. 启动管家桌宠 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="px-4 py-2 rounded-lg text-sm bg-[var(--color-accent)] text-white disabled:opacity-50"
          disabled={launching}
          onClick={() => void launchPet()}
        >
          {launching ? '启动中…' : '启动管家桌宠'}
        </button>
        {launchMsg && <span className="text-xs opacity-70">{launchMsg}</span>}
      </div>
      <p className="text-xs opacity-50">
        在桌面唤出管家悬浮窗；重复点击只会唤起已有窗口，不会重复启动。
      </p>

      {/* 3. 自定义形象 */}
      <div className="space-y-2 border-t border-white/5 pt-3">
        <div className="text-sm text-white/70">桌宠形象</div>
        <div className="flex gap-2 flex-wrap">
          {([['ball', '小球'], ['vrm', 'VRM'], ['image', '自定义图片']] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`px-3 py-1 rounded-full text-xs ${
                avatar === mode ? 'bg-[var(--color-accent)] text-white' : 'bg-white/10 hover:bg-white/20'
              }`}
              onClick={() => pickAvatar(mode)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="text-xs file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-white/10 file:text-white/80 file:cursor-pointer"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
            }}
          />
          {uploading && <span className="text-xs opacity-70">上传中…</span>}
        </div>
        {uploadMsg && <div className="text-xs opacity-70">{uploadMsg}</div>}
        <p className="text-xs opacity-50">
          上传 png/jpg/webp（≤5MB）作为管家形象，选择「自定义图片」后立即生效，桌宠窗口同步切换。
        </p>
      </div>
    </section>
  );
}
