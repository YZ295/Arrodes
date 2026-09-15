/**
 * 管家控制台（surface=butler 独立窗口页）
 * 极简外壳：标题 + 连接状态 + ButlerPanel（截图采集引擎/记录/汇总）
 */
import { useEffect, useState } from 'react';
import ButlerPanel from './ButlerPanel';

export default function ButlerConsole() {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let stopped = false;
    const ping = async (): Promise<void> => {
      try {
        const res = await fetch('/api/v1/butler/status', { signal: AbortSignal.timeout(4000) });
        if (!stopped) setConnected(res.ok);
      } catch {
        if (!stopped) setConnected(false);
      }
    };
    void ping();
    const t = setInterval(ping, 8000);
    return () => { stopped = true; clearInterval(t); };
  }, []);

  return (
    <div className="min-h-screen w-full bg-[#0f1115] text-white/85 p-5">
      <header className="flex items-center gap-3 mb-4">
        <h1 className="text-lg font-semibold">管家控制台</h1>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            connected === null
              ? 'bg-white/10'
              : connected
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-red-500/20 text-red-300'
          }`}
        >
          {connected === null ? '连接中…' : connected ? '后端已连接' : '后端未连接'}
        </span>
      </header>
      <div className="max-w-3xl">
        <ButlerPanel />
      </div>
    </div>
  );
}
