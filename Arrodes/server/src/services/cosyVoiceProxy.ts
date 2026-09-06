/**
 * CosyVoice 2 本地 TTS 引擎代理（Engine B）
 *
 * 职责：
 * - 懒启动 Python sidecar（首次请求时 spawn，避免拖累主服务启动）
 * - 健康检查：无响应判死重启
 * - 失败自动上报，由上层降级链决定是否切换
 *
 * 启动命令（cosyvoice conda 环境）：
 *   conda run -n cosyvoice python tts-sidecar/tts_sidecar.py --port 12001
 */
import { spawn, ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIDECAR_PORT = 12001;
const SIDECAR_URL = `http://127.0.0.1:${SIDECAR_PORT}`;

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

/** 找到可用的 conda 环境路径 */
function findCondaPython(): string | null {
  const candidates = [
    process.env.COSYVOICE_PYTHON, // 显式指定
    'D:/Anaconda/envs/cosyvoice/python.exe',
    'C:/ProgramData/Anaconda3/envs/cosyvoice/python.exe',
    'C:/Users/29352/anaconda3/envs/cosyvoice/python.exe',
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
  async checkAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${SIDECAR_URL}/health`, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) return false;
      const data = await res.json() as { status?: string };
      if (data.status === 'ok') {
        this.failedCount = 0;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /** 确保 sidecar 已启动（懒启动） */
  async ensureStarted(): Promise<boolean> {
    if (await this.checkAvailable()) return true;
    if (this.starting) {
      // 已在启动中，等待就绪（最多 60s）
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (await this.checkAvailable()) return true;
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
      this.lastError = '未找到 cosyvoice conda 环境（请先创建: conda create -n cosyvoice python=3.10）';
      return false;
    }

    this.starting = true;
    console.log('[CosyVoice] 启动 sidecar ...');

    // 用 conda run 或直接 python
    const args = condaPython.includes('conda.exe')
      ? ['run', '-n', 'cosyvoice', 'python', script, '--port', String(SIDECAR_PORT)]
      : [script, '--port', String(SIDECAR_PORT)];

    this.proc = spawn(condaPython, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        // 打包版：注入本机 CosyVoice 项目根（含模型权重），sidecar 找不到模型时兜底
        ...(PROJECT_DIR ? { COSYVOICE_PROJECT_DIR: PROJECT_DIR } : {}),
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
      await new Promise((r) => setTimeout(r, 1000));
      if (await this.checkAvailable()) {
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
  ): Promise<{ audioPath: string }> {
    const ok = await this.ensureStarted();
    if (!ok) {
      this.failedCount++;
      throw new Error(`CosyVoice 不可用: ${this.lastError || '启动失败'}`);
    }

    const res = await fetch(`${SIDECAR_URL}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text, voice, rate,
        ...(promptWav ? { promptWav, promptText } : {}),
      }),
      signal: AbortSignal.timeout(120000), // 首次合成含模型加载，给足 2 分钟
    });

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
