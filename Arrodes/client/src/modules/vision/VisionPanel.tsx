/**
 * 视觉识别面板
 * 支持：拍照上传、文件上传、AI 视觉理解
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useCamera } from './useCamera';

/* ============================================================
 * CameraPreview — 摄像头实时预览
 * ============================================================ */
function CameraPreview({
  stream,
  onCapture,
  onClose,
}: {
  stream: MediaStream | null;
  onCapture: () => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) return null;

  return (
    <div className="relative rounded-xl overflow-hidden bg-black/60">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-48 object-cover"
      />
      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
        <button
          onClick={onCapture}
          className="w-12 h-12 rounded-full bg-white/20 backdrop-blur border-2 border-white flex items-center justify-center hover:bg-white/30 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-white" />
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg bg-red-500/60 text-white text-xs hover:bg-red-500/80 transition-colors"
        >
          关闭
        </button>
      </div>
    </div>
  );
}

/* ============================================================
 * SnapshotPreview — 截图/上传预览
 * ============================================================ */
function SnapshotPreview({
  snapshot,
  onAnalyze,
  onDiscard,
  analyzing,
}: {
  snapshot: string;
  onAnalyze: () => void;
  onDiscard: () => void;
  analyzing: boolean;
}) {
  return (
    <div className="relative rounded-xl overflow-hidden bg-black/40">
      <img src={snapshot} alt="预览" className="w-full h-48 object-contain" />
      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
        <button
          onClick={onAnalyze}
          disabled={analyzing}
          className="px-4 py-2 rounded-lg bg-[var(--color-home-gold)] text-[var(--color-bg-deep)] text-sm font-medium
            hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-wait flex items-center gap-1.5"
        >
          {analyzing ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.3" />
                <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
              分析中...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3v13m0 0l-3-3m3 3l3-3M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              让阿罗德斯看看
            </>
          )}
        </button>
        <button
          onClick={onDiscard}
          disabled={analyzing}
          className="px-3 py-1.5 rounded-lg bg-white/10 text-gray-300 text-xs hover:bg-white/20 transition-colors disabled:opacity-50"
        >
          重新拍摄
        </button>
      </div>
    </div>
  );
}

/* ============================================================
 * VisionResult — AI 视觉描述结果
 * ============================================================ */
function VisionResult({
  description,
  durationMs,
  model,
}: {
  description: string;
  durationMs?: number;
  model?: string;
}) {
  return (
    <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-[var(--color-home-gold)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
        </svg>
        <span className="text-sm font-medium text-gray-200">阿罗德斯看到了：</span>
      </div>
      <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{description}</p>
      {(durationMs || model) && (
        <div className="mt-2 text-[13px] text-gray-500 flex gap-3">
          {model && <span>模型: {model}</span>}
          {durationMs && <span>耗时: {(durationMs / 1000).toFixed(1)}s</span>}
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * VisionPanel — 主面板
 * ============================================================ */
export default function VisionPanel() {
  const [mode, setMode] = useState<'idle' | 'camera' | 'preview'>('idle');
  const [pendingBase64, setPendingBase64] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{
    description: string;
    durationMs: number;
    model: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    stream,
    snapshot,
    error: cameraError,
    startCamera,
    stopCamera,
    takeSnapshot,
    loadFromFile,
  } = useCamera();

  // 错误同步
  useEffect(() => {
    if (cameraError) setError(cameraError);
  }, [cameraError]);

  // 开始拍照模式
  const handleStartCamera = useCallback(async () => {
    setError(null);
    setResult(null);
    try {
      await startCamera();
      setMode('camera');
    } catch {
      setError('无法启动摄像头，请检查权限设置');
    }
  }, [startCamera]);

  // 从文件上传
  const handleUploadFile = useCallback(async () => {
    setError(null);
    setResult(null);
    const base64 = await loadFromFile();
    if (base64) {
      setPendingBase64(base64);
      setMode('preview');
    }
  }, [loadFromFile]);

  // 拍照
  const handleCapture = useCallback(() => {
    const base64 = takeSnapshot();
    if (base64) {
      stopCamera();
      setPendingBase64(base64);
      setMode('preview');
    }
  }, [takeSnapshot, stopCamera]);

  // 重新拍摄
  const handleDiscard = useCallback(() => {
    setPendingBase64(null);
    setResult(null);
    setMode('idle');
  }, []);

  // 分析图片
  const handleAnalyze = useCallback(async () => {
    if (!pendingBase64) return;

    setAnalyzing(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/vision/analyze-base64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: pendingBase64,
          imageFormat: 'jpeg',
          prompt: '请详细描述这张图片中的所有内容，包括物体、人物、场景、颜色、文字等。如果是代码或截图，请读出其中的文字信息。',
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '视觉分析请求失败' }));
        throw new Error(err.error || `服务器错误 ${res.status}`);
      }

      const data = await res.json();
      setResult({
        description: data.description,
        durationMs: data.durationMs,
        model: data.model,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '视觉分析失败';
      setError(msg);
    } finally {
      setAnalyzing(false);
    }
  }, [pendingBase64]);

  // 关闭摄像头时的清理
  const handleCloseCamera = useCallback(() => {
    stopCamera();
    setMode('idle');
  }, [stopCamera]);

  return (
    <div className="px-3 py-2">
      {/* 标题 */}
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-[var(--color-home-gold)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        <span className="text-sm font-medium text-gray-200">视觉识别</span>
        {result && <span className="text-[13px] text-green-400">✓ 已识别</span>}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-300">&times;</button>
        </div>
      )}

      {/* 模式切换 */}
      {mode === 'idle' && (
        <div className="flex gap-2">
          <button
            onClick={handleStartCamera}
            className="flex-1 py-3 rounded-xl border border-dashed border-white/15 text-sm text-gray-400
              hover:border-[var(--color-home-gold)]/40 hover:text-[var(--color-home-gold)]/70 transition-colors
              flex flex-col items-center gap-1"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span>拍照</span>
          </button>
          <button
            onClick={handleUploadFile}
            className="flex-1 py-3 rounded-xl border border-dashed border-white/15 text-sm text-gray-400
              hover:border-[var(--color-home-gold)]/40 hover:text-[var(--color-home-gold)]/70 transition-colors
              flex flex-col items-center gap-1"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>上传图片</span>
          </button>
        </div>
      )}

      {/* 摄像头预览 */}
      {mode === 'camera' && (
        <CameraPreview stream={stream} onCapture={handleCapture} onClose={handleCloseCamera} />
      )}

      {/* 截图/上传预览 */}
      {mode === 'preview' && snapshot && (
        <>
          <SnapshotPreview
            snapshot={snapshot}
            onAnalyze={handleAnalyze}
            onDiscard={handleDiscard}
            analyzing={analyzing}
          />
        </>
      )}

      {/* 分析结果 */}
      {result && <VisionResult description={result.description} durationMs={result.durationMs} model={result.model} />}

      {/* 分析完成后，重新拍摄按钮 */}
      {result && (
        <button
          onClick={handleDiscard}
          className="mt-2 w-full py-2 rounded-lg border border-white/10 text-xs text-gray-400 hover:bg-white/5 transition-colors"
        >
          拍一张新的
        </button>
      )}
    </div>
  );
}
