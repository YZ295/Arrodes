/**
 * 摄像头 Hook
 * 管理摄像头权限、画面捕获、截图
 */
import { useState, useRef, useCallback, useEffect } from 'react';

interface UseCameraReturn {
  /** 是否正在使用摄像头 */
  isActive: boolean;
  /** 视频流 */
  stream: MediaStream | null;
  /** 最近一次捕获的截图 (data URL) */
  snapshot: string | null;
  /** 错误信息 */
  error: string | null;
  /** 启动摄像头 */
  startCamera: () => Promise<void>;
  /** 停止摄像头 */
  stopCamera: () => void;
  /** 拍摄快照 (返回 base64) */
  takeSnapshot: () => string | null;
  /** 从文件读取图片 (返回 base64) */
  loadFromFile: () => Promise<string | null>;
}

export function useCamera(): UseCameraReturn {
  const [isActive, setIsActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 清理
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [stream]);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment', // 优先后置
        },
        audio: false,
      });
      setStream(mediaStream);
      setIsActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '无法访问摄像头';
      setError(msg);
      throw err;
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    setIsActive(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  const takeSnapshot = useCallback((): string | null => {
    if (!stream) return null;

    // 创建一个隐藏的 video 元素来捕获当前帧
    const video = document.createElement('video');
    video.srcObject = stream;
    video.play();

    // 等待一帧以确保画面就绪
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    // 存储截图预览
    setSnapshot(dataUrl);

    // 清理
    video.pause();
    video.srcObject = null;

    // 返回裸 base64 (不含 data:image/...;base64, 前缀)
    const base64 = dataUrl.split(',')[1];
    return base64;
  }, [stream]);

  const loadFromFile = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp,image/gif';

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }

        // 限制 10MB
        if (file.size > 10 * 1024 * 1024) {
          setError('图片太大 (最大 10MB)');
          resolve(null);
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          setSnapshot(dataUrl);
          // 返回裸 base64
          const base64 = dataUrl.split(',')[1];
          resolve(base64);
        };
        reader.onerror = () => {
          setError('读取文件失败');
          resolve(null);
        };
        reader.readAsDataURL(file);
      };

      input.click();
    });
  }, []);

  return {
    isActive,
    stream,
    snapshot,
    error,
    startCamera,
    stopCamera,
    takeSnapshot,
    loadFromFile,
  };
}
