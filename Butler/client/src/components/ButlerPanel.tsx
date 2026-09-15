/**
 * 管家面板：截图采集引擎状态 + 最近记录 + 按日 10 分钟段汇总
 *
 * 数据源：/api/v1/butler/*（只读数据查看 + 采集启停，不扩展其他能力）
 * 状态判定：
 *  - engine.running → 运行中（外部旧版实例只读不可控停）
 *  - !running && state.summarizing && state.stale → 异常（上次异常退出）
 *  - 其余 → 已停止
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../shared/utils/apiClient';

interface ButlerStatus {
  engine: {
    running: boolean;
    pid: number | null;
    source: 'managed' | 'external' | 'external-legacy' | 'none';
    managed: boolean;
    startedAt: string | null;
  };
  state: {
    summarizing: boolean;
    queue: number;
    current: { date: string; start: string; end: string } | null;
    updatedAt: string | null;
    stale: boolean;
  };
}

interface ButlerRecord { ts: string; status: string }

interface ButlerSegment {
  idx?: number;
  start?: string;
  end?: string;
  status?: string;
  project?: string;
  category?: string;
  edited?: boolean;
  samples?: number;
}

function fmtTs(ts: string): string {
  return ts.replace('T', ' ').replace(/\+08:00$/, '').replace(/Z$/, '');
}

export function ButlerPanel() {
  const [status, setStatus] = useState<ButlerStatus | null>(null);
  const [records, setRecords] = useState<ButlerRecord[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [dayYmd, setDayYmd] = useState('');
  const [day, setDay] = useState<{ date: string; segments: ButlerSegment[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const st = await api.get<ButlerStatus>('/butler/status');
      setStatus(st);
      const rec = await api.get<{ records: ButlerRecord[] }>('/butler/records/recent?limit=20');
      setRecords(rec.records || []);
      const d = await api.get<{ dates: string[] }>('/butler/summary/dates');
      setDates(d.dates || []);
      if (!dayYmd && d.dates?.length) setDayYmd(d.dates[0]);
      setLoadError('');
    } catch {
      setLoadError('管家状态加载失败（后端未启动或接口不可用）');
    }
  }, [dayYmd]);

  const loadDay = useCallback(async (ymd: string) => {
    if (!/^\d{8}$/.test(ymd)) return;
    try {
      const d = await api.get<{ date: string; segments: ButlerSegment[] }>(
        `/butler/summary/day?ymd=${ymd}`);
      setDay(d);
    } catch {
      setDay({ date: ymd, segments: [] });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  // 状态轮询（引擎状态 30s 心跳级，无需高频）
  useEffect(() => {
    const t = setInterval(() => {
      api.get<ButlerStatus>('/butler/status')
        .then((st) => { setStatus(st); setLoadError(''); })
        .catch(() => { /* 轮询失败静默，不打断界面 */ });
    }, 10000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { if (dayYmd) void loadDay(dayYmd); }, [dayYmd, loadDay]);

  const doStart = async () => {
    setBusy(true); setError('');
    try {
      await api.post('/butler/start');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动失败');
    } finally { setBusy(false); }
  };

  const doStop = async () => {
    setBusy(true); setError('');
    try {
      await api.post('/butler/stop');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '停止失败');
    } finally { setBusy(false); }
  };

  const eng = status?.engine;
  const st = status?.state;
  const legacy = eng?.source === 'external-legacy';
  const abnormal = !eng?.running && st?.summarizing && st?.stale;

  const badge = eng?.running
    ? (legacy ? '运行中（外部旧版实例）' : '运行中')
    : abnormal ? '异常' : '已停止';
  const badgeCls = eng?.running
    ? (legacy ? 'bg-amber-500/15 text-amber-300 border-amber-400/30' : 'bg-green-500/15 text-green-300 border-green-400/30')
    : abnormal
      ? 'bg-amber-500/15 text-amber-300 border-amber-400/30'
      : 'bg-white/5 text-white/40 border-white/10';

  return (
    <div className="p-5 space-y-5" data-role="butler-panel">
      {/* 采集引擎 */}
      <section className="bg-white/3 rounded-xl p-4 border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] text-white/30 uppercase tracking-wider">截图采集引擎</h3>
          <span className={`text-[16px] px-2.5 py-0.5 rounded-full border ${badgeCls}`}>{badge}</span>
        </div>

        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-white/40">管理方</span>
            <span className="text-white/70">
              {eng?.running
                ? (eng.managed ? '本应用' : legacy ? '外部旧版实例（只读）' : '外部实例（独立控制台）')
                : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">进程</span>
            <span className="text-white/70 font-mono">{eng?.pid ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">汇总进度</span>
            <span className="text-white/70">
              {st?.summarizing
                ? `汇总中 ${st.current ? `${st.current.date} ${st.current.start}-${st.current.end}` : ''}（队列 ${st.queue}）`
                : st?.stale ? '状态数据陈旧' : '空闲'}
            </span>
          </div>
          {st?.updatedAt && (
            <div className="flex justify-between">
              <span className="text-white/40">心跳</span>
              <span className={`text-white/50 ${st.stale ? 'text-amber-300/70' : ''}`}>{fmtTs(st.updatedAt)}</span>
            </div>
          )}
          {abnormal && (
            <div className="text-[16px] text-amber-300/80 bg-amber-500/10 px-3 py-1.5 rounded">
              上次引擎异常退出（汇总状态陈旧）。重新启动不会丢失已采集数据。
            </div>
          )}
        </div>

        {error && <div className="text-[16px] text-red-400 bg-red-500/10 px-3 py-1.5 rounded" data-role="butler-error">{error}</div>}
        {loadError && <div className="text-[16px] text-red-400 bg-red-500/10 px-3 py-1.5 rounded">{loadError}</div>}

        <div className="flex gap-2">
          <button
            data-role="butler-start"
            onClick={doStart}
            disabled={busy || !!eng?.running}
            className="flex-1 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 text-[16px] hover:bg-cyan-500/30
              disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? '处理中…' : '启动采集'}
          </button>
          <button
            data-role="butler-stop"
            onClick={doStop}
            disabled={busy || !eng?.running || legacy}
            title={legacy ? '外部旧版实例无 PID 文件，无法安全停止' : undefined}
            className="flex-1 py-2 rounded-lg bg-red-500/15 text-red-300 text-[16px] hover:bg-red-500/25
              disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? '处理中…' : '停止采集'}
          </button>
        </div>
      </section>

      {/* 最近记录 */}
      <section className="bg-white/3 rounded-xl p-4 border border-white/5">
        <h3 className="text-[16px] text-white/30 uppercase tracking-wider mb-3">最近采集记录</h3>
        {records.length === 0 ? (
          <div className="text-sm text-white/25 py-3 text-center">暂无记录（引擎未采集过）</div>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {records.map((r, i) => (
              <div key={`${r.ts}-${i}`} className="flex items-center justify-between text-sm">
                <span className="text-white/60 font-mono">{fmtTs(r.ts)}</span>
                <span className={`text-[16px] ${r.status === 'raw' ? 'text-blue-400/70' : 'text-white/30'}`}>
                  {r.status === 'unchanged' ? '画面无变化' : r.status === 'raw' ? '已采集' : r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 按日 10 分钟汇总 */}
      <section className="bg-white/3 rounded-xl p-4 border border-white/5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[16px] text-white/30 uppercase tracking-wider">按日十分钟汇总</h3>
          {dates.length > 0 && (
            <select
              value={dayYmd}
              onChange={(e) => setDayYmd(e.target.value)}
              className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-sm text-white/70 outline-none"
            >
              {dates.map((d) => (
                <option key={d} value={d} className="bg-[#0f1115]">
                  {d.slice(0, 4)}-{d.slice(4, 6)}-{d.slice(6, 8)}
                </option>
              ))}
            </select>
          )}
        </div>
        {day && day.segments.length > 0 ? (
          <div className="space-y-2">
            {day.segments.map((s, i) => (
              <div key={s.idx ?? i} className="flex items-start gap-2 rounded-lg bg-white/3 border border-white/5 px-3 py-2">
                <span className="text-[16px] text-blue-400/70 font-mono shrink-0">{s.start}-{s.end}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white/80 truncate">
                    {s.project || '（未命名）'}
                    {s.edited && <span className="ml-1.5 text-[16px] text-cyan-400/60">已修正</span>}
                  </div>
                  <div className="text-[16px] text-white/30">
                    {s.category || '未分类'}{typeof s.samples === 'number' ? ` · ${s.samples} 帧` : ''}
                    {s.status === 'failed' ? ' · 汇总失败' : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-white/25 py-3 text-center">
            {dates.length === 0 ? '暂无汇总数据' : '该日无汇总段'}
          </div>
        )}
      </section>
    </div>
  );
}

export default ButlerPanel;
