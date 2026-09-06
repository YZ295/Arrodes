/**
 * CosyVoice 3 本地 TTS 引擎代理（Engine B）
 *
 * 职责：
 * - 懒启动 Python sidecar（首次请求时 spawn，避免拖累主服务启动）
 * - 健康检查：无响应判死重启
 * - 失败自动上报，由上层降级链决定是否切换
 *
 * 启动命令（cosyvoice3 conda 环境）：
 *   conda run -n cosyvoice3 python tts-sidecar/tts_sidecar.py --port 12003
 */
import { spawn, ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIDECAR_PORT = Number(process.env.COSYVOICE3_PORT || 12003);
const SIDECAR_URL = process.env.COSYVOICE3_SIDECAR_URL || `http://127.0.0.1:${SIDECAR_PORT}`;

// sidecar 脚本路径：server/../tts-sidecar/tts_sidecar.py
const SIDECAR_SCRIPT = resolve(__dirname, '../../tts-sidecar/tts_sidecar.py');
const SIDECAR_SCRIPT_ALT = resolve(__dirname, '../../../tts-sidecar/tts_sidecar.py');

// CosyVoice 项目根（含模型权重）。桌面打包版不带模型，运行时指向本机已有项目：
// 优先级：env COSYVOICE_PROJECT_DIR > 本机开发路径（Arrodes 仓库内）
const DEV_PROJECT_DIRS = [
  process.env.COSYVOICE_PROJECT_DIR,
  'E:/project/Crow5/Arrodes/Arrodes/tts-sidecar/CosyVoice-unzip/cosyvoice-main',
  'E:/project/Crow5/Arrodes/tts-sidecar/CosyVoice-unzip/cosyvoice-main',
];
const PROJECT_DIR = DEV_PROJECT_DIRS.find((d) => d && existsSync(d)) || null;
const MODEL_DIR = process.env.COSYVOICE3_MODEL_DIR
  || (PROJECT_DIR ? join(PROJECT_DIR, 'pretrained_models', 'Fun-CosyVoice3-0.5B-2512') : null);

function abortError(): Error {
  const error = new Error('CosyVoice request aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolveDelay, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolveDelay();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function linkedTimeoutSignal(parent: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  parent?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onAbort);
    },
  };
}

/** 找到可用的 conda 环境路径 */
function findCondaPython(): string | null {
  const candidates = [
    process.env.COSYVOICE3_PYTHON,
    process.env.COSYVOICE_PYTHON, // 兼容旧变量名
    'D:/Anaconda/envs/cosyvoice3/python.exe',
    'C:/ProgramData/Anaconda3/envs/cosyvoice3/python.exe',
    'C:/Users/29352/anaconda3/envs/cosyvoice3/python.exe',
    'D:/Anaconda/Scripts/conda.exe', // 兜底：用 conda run
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

class CosyVoiceEngine {
  private proc: ChildProcess | null = null;
  private starting = false;
  private failedCount = 0;
  private lastError: string | null = null;

  /** sidecar 是否已可用（健康检查通过） */
  async checkAvailable(signal?: AbortSignal): Promise<boolean> {
    throwIfAborted(signal);
    const linked = linkedTimeoutSignal(signal, 2000);
    try {
      const res = await fetch(`${SIDECAR_URL}/health`, { signal: linked.signal });
      if (!res.ok) return false;
      const data = await res.json() as { status?: string };
      if (data.status === 'ok') {
        this.failedCount = 0;
        return true;
      }
      return false;
    } catch {
      throwIfAborted(signal);
      return false;
    } finally {
      linked.dispose();
    }
  }

  /** 确保 sidecar 已启动（懒启动） */
  async ensureStarted(signal?: AbortSignal): Promise<boolean> {
    throwIfAborted(signal);
    if (await this.checkAvailable(signal)) return true;
    if (this.starting) {
      // 已在启动中，等待就绪（最多 60s）
      for (let i = 0; i < 60; i++) {
        await abortableDelay(1000, signal);
        if (await this.checkAvailable(signal)) return true;
      }
      return false;
    }

    const script = existsSync(SIDECAR_SCRIPT) ? SIDECAR_SCRIPT : SIDECAR_SCRIPT_ALT;
    if (!existsSync(script)) {
      this.lastError = `sidecar 脚本不存在: ${script}`;
      return false;
    }

    const condaPython = findCondaPython();
    if (!condaPython) {
      this.lastError = '未找到 cosyvoice3 conda 环境（请先创建: conda create -n cosyvoice3 python=3.10）';
      return false;
    }

    this.starting = true;
    console.log('[CosyVoice] 启动 sidecar ...');

    // 用 conda run 或直接 python
    const args = condaPython.includes('conda.exe')
      ? ['run', '-n', 'cosyvoice3', 'python', script, '--port', String(SIDECAR_PORT)]
      : [script, '--port', String(SIDECAR_PORT)];

    this.proc = spawn(condaPython, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        COSYVOICE_MODEL_KIND: '3',
        // 打包版：注入本机 CosyVoice 项目根（含模型权重），sidecar 找不到模型时兜底
        ...(PROJECT_DIR ? { COSYVOICE_PROJECT_DIR: PROJECT_DIR } : {}),
        ...(MODEL_DIR ? { COSYVOICE_MODEL_DIR: MODEL_DIR } : {}),
      },
    });

    this.proc.stdout?.on('data', (d) => process.stdout.write(`[CosyVoice] ${d}`));
    this.proc.stderr?.on('data', (d) => process.stderr.write(`[CosyVoice] ${d}`));
    this.proc.on('exit', (code) => {
      console.log(`[CosyVoice] sidecar 退出 (code=${code})`);
      this.proc = null;
      this.starting = false;
    });

    // 等待就绪（模型加载可能需 30-60s）
    for (let i = 0; i < 90; i++) {
      await abortableDelay(1000, signal);
      if (await this.checkAvailable(signal)) {
        this.starting = false;
        console.log('[CosyVoice] sidecar 就绪');
        return true;
      }
    }
    this.starting = false;
    this.lastError = 'sidecar 启动超时（90s）';
    return false;
  }

  /** 合成语音，返回 wav 文件路径（promptWav/promptText 为 T9 自定义音色参考音频） */
  async synthesize(
    text: string,
    voice = 'default',
    rate = 1.0,
    promptWav?: string,
    promptText?: string,
    signal?: AbortSignal,
  ): Promise<{ audioPath: string }> {
    const ok = await this.ensureStarted(signal);
    if (!ok) {
      this.failedCount++;
      throw new Error(`CosyVoice 不可用: ${this.lastError || '启动失败'}`);
    }

    const linked = linkedTimeoutSignal(signal, 120000);
    let res: Response;
    try {
      res = await fetch(`${SIDECAR_URL}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text, voice, rate,
          ...(promptWav ? { promptWav, promptText } : {}),
        }),
        signal: linked.signal,
      });
    } catch (error) {
      throwIfAborted(signal);
      throw error;
    } finally {
      linked.dispose();
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      this.failedCount++;
      throw new Error(`CosyVoice 合成失败: ${(err as any).detail || err}`);
    }

    const data = await res.json() as { audioPath: string; contentType: string; duration: number };
    this.failedCount = 0;
    return { audioPath: data.audioPath };
  }

  /** 获取失败统计（供熔断决策） */
  getStats() {
    return { failedCount: this.failedCount, lastError: this.lastError };
  }

  /** 优雅关闭 */
  async shutdown(): Promise<void> {
    if (this.proc) {
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
  }
}

export const cosyVoiceEngine = new CosyVoiceEngine();
