import { useCallback, useEffect, useRef, useState } from 'react';

interface VisionStatus {
  available: boolean;
  model: string;
  provider?: string;
  state?: string;
  device?: string;
  error?: string;
}

const STATUS_TIMEOUT_MS = 8_000;

export function useVisionStatus() {
  const [status, setStatus] = useState<VisionStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  const refreshStatus = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setChecking(true);
    setStatusError(null);
    const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
    try {
      const response = await fetch('/api/v1/vision/status', { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data || typeof data.available !== 'boolean' || typeof data.model !== 'string'
        || ['provider', 'state', 'device', 'error'].some(key => data[key] !== undefined && typeof data[key] !== 'string')) {
        throw new Error('状态响应格式无效');
      }
      if (request.current === controller) setStatus(data);
    } catch (error) {
      if (request.current !== controller) return;
      setStatus(null);
      setStatusError(controller.signal.aborted ? '请求超时' : error instanceof Error ? error.message : '网络连接失败');
    } finally {
      clearTimeout(timer);
      if (request.current === controller) setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    return () => {
      const current = request.current;
      request.current = null;
      current?.abort();
    };
  }, [refreshStatus]);

  return { status, checking, statusError, refreshStatus };
}
