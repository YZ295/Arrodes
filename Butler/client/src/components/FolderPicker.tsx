/**
 * 项目文件夹选择器（复用：工作区面板 + Agent 对话面板）
 */
import { useState, useCallback, useEffect } from 'react';

interface FolderPickerProps {
  open: boolean;
  initialPath?: string;
  onClose: () => void;
  onSelect: (path: string) => Promise<void> | void;
}

export default function FolderPicker({ open, initialPath = '', onClose, onSelect }: FolderPickerProps) {
  const [path, setPath] = useState('');
  const [parent, setParent] = useState<string | null>(null);
  const [dirs, setDirs] = useState<string[]>([]);
  const [roots, setRoots] = useState<string[]>([]);
  const [atRoots, setAtRoots] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 驱动器选择页（无初始路径时的起始页 + 盘符根目录的「其他驱动器」入口）
  const loadRoots = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/workspace/roots');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRoots(data.roots || []);
      setAtRoots(true);
      setPath('');
      setParent(null);
      setDirs([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '浏览失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const browse = useCallback(async (p?: string) => {
    const target = p || initialPath;
    if (!target) {
      await loadRoots();
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/workspace/browse?path=${encodeURIComponent(target)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPath(data.path);
      setParent(data.parent);
      setDirs(data.dirs || []);
      setRoots(data.roots || []);
      setAtRoots(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '浏览失败');
    } finally {
      setLoading(false);
    }
  }, [initialPath, loadRoots]);

  useEffect(() => {
    if (open) browse();
  }, [open, browse]);

  const isDriveRoot = /^[A-Za-z]:[\\/]?$/.test(path);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#02040a]/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl border border-blue-400/25 bg-[#0b1022]/95 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-white/85">选择项目文件夹</h3>
          <button onClick={onClose} className="text-[16px] text-white/40 hover:text-white/70">✕</button>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={atRoots ? '（请选择驱动器）' : path}
            readOnly
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[16px] text-white/70"
          />
          {(parent || isDriveRoot) && !atRoots && (
            <button
              onClick={() => (isDriveRoot ? loadRoots() : browse(parent ?? undefined))}
              className="px-2 py-1.5 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 text-[16px]"
            >
              ↑ 上级
            </button>
          )}
        </div>
        {loading && <div className="text-sm text-white/30">加载中…</div>}
        {error && <div className="text-sm text-red-400/80">{error}</div>}
        <div className="max-h-60 overflow-y-auto space-y-1 [scrollbar-width:thin]">
          {atRoots ? (
            <>
              {roots.map((r) => (
                <button
                  key={r}
                  onClick={() => browse(r)}
                  className="w-full text-left px-2.5 py-2 rounded-lg bg-white/3 hover:bg-white/8 text-sm text-white/75 transition-colors flex items-center gap-2"
                >
                  <span>💽</span>
                  <span>{r}</span>
                </button>
              ))}
              {!loading && roots.length === 0 && (
                <div className="text-sm text-white/25 text-center py-3">未检测到可用驱动器</div>
              )}
            </>
          ) : (
            <>
              {isDriveRoot && (
                <button
                  onClick={loadRoots}
                  className="w-full text-left px-2.5 py-2 rounded-lg bg-white/3 hover:bg-white/8 text-sm text-white/75 transition-colors flex items-center gap-2"
                >
                  <span>💽</span>
                  <span>其他驱动器…</span>
                </button>
              )}
              {dirs.map((d) => (
                <button
                  key={d}
                  onClick={() => browse(`${path.replace(/[\\/]+$/, '')}/${d}`)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white/3 hover:bg-white/8 text-sm text-white/75 transition-colors"
                >
                  📁 {d}
                </button>
              ))}
              {!loading && dirs.length === 0 && (
                <div className="text-sm text-white/25 text-center py-3">此目录下没有子文件夹</div>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-white/5 text-white/60 hover:bg-white/10">取消</button>
          <button
            onClick={() => onSelect(path)}
            disabled={!path || atRoots}
            className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-200 hover:bg-blue-500/30 disabled:opacity-40"
          >
            选择此文件夹
          </button>
        </div>
      </div>
    </div>
  );
}
