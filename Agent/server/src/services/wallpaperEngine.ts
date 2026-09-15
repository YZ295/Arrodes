/**
 * Wallpaper Engine 薄封装（借鉴 wallpaper-engine-api 的交互思路，自研实现）
 *
 * 事实（本机实测）：
 * - 列表：workshop 目录（steamapps/workshop/content/431960）下每个子目录
 *   含 project.json（title/preview/tags/type）；
 * - 当前壁纸：WE 安装目录 config.json →
 *   [windows用户名].general.wallpaperconfig.selectedwallpapers.{MonitorN}.file；
 * - 应用：`wallpaper64.exe -control openWallpaper -file <project.json>`，
 *   spawn 无 shell、无字符串拼接（实测 exit=0）；
 * - `-control getWallpaper` 的 stdout 在本机不可靠，弃用。
 *
 * 安全：apply/preview 一律以扫描结果白名单为准，id 不直接拼接路径。
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import os from 'node:os';

/** 对外壁纸信息（路由/客户端可见字段） */
export interface WallpaperInfo {
  id: string;
  title: string;
  previewUrl: string;
  tags: string[];
  type: string;
  /** 内部：project.json 绝对路径（白名单依据） */
  projectJsonPath: string;
  /** 内部：预览图绝对路径（缺失为 null） */
  previewPath: string | null;
}

/** 对外公开字段（不泄露本地绝对路径） */
export interface WallpaperPublicInfo {
  id: string;
  title: string;
  previewUrl: string;
  tags: string[];
  type: string;
}

export interface WallpaperOverview {
  connected: boolean;
  current: WallpaperPublicInfo | null;
  wallpapers: WallpaperPublicInfo[];
}

export interface ControlResult {
  exitCode: number;
  error?: string;
}

export interface WallpaperEngineOptions {
  installPath?: string;
  workshopPath?: string;
  controlTimeoutMs?: number;
  /** 测试注入：替换真实 spawn 通道 */
  control?: (exePath: string, args: string[]) => Promise<ControlResult>;
}

export class WallpaperError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'WallpaperError';
  }
}

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};

const COMMON_INSTALL_CANDIDATES = [
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine',
  'C:\\Program Files\\Steam\\steamapps\\common\\wallpaper_engine',
];

/** 盘符扫描：{drive}:\SteamLibrary / {drive}:\Steam 两种库布局 */
function driveScanInstallCandidates(): string[] {
  const found: string[] = [];
  for (let i = 0; i < 26; i += 1) {
    const drive = `${String.fromCharCode(65 + i)}:`;
    for (const variant of ['SteamLibrary', 'Steam']) {
      const p = `${drive}\\${variant}\\steamapps\\common\\wallpaper_engine`;
      if (existsSync(p)) found.push(p);
    }
  }
  return found;
}

function envValue(key: string): string | null {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : null;
}

function toPublic(info: WallpaperInfo) {
  return {
    id: info.id,
    title: info.title,
    previewUrl: info.previewUrl,
    tags: info.tags,
    type: info.type,
  };
}

export class WallpaperEngine {
  private readonly opts: WallpaperEngineOptions;

  constructor(opts: WallpaperEngineOptions = {}) {
    this.opts = opts;
  }

  get installPath(): string | null {
    if (this.opts.installPath) return this.opts.installPath;
    const fromEnv = envValue('ARRODES_WE_INSTALL');
    if (fromEnv) return fromEnv;
    const found = [...COMMON_INSTALL_CANDIDATES, ...driveScanInstallCandidates()].find(
      (p) => existsSync(p),
    );
    return found ?? null;
  }

  get workshopPath(): string | null {
    if (this.opts.workshopPath) return this.opts.workshopPath;
    const fromEnv = envValue('ARRODES_WE_WORKSHOP');
    if (fromEnv) return fromEnv;
    const install = this.installPath;
    if (!install || !existsSync(install)) return null;
    // <lib>/steamapps/common/wallpaper_engine → <lib>/steamapps/workshop/content/431960
    return join(dirname(dirname(install)), 'workshop', 'content', '431960');
  }

  get exePath(): string | null {
    const install = this.installPath;
    if (!install) return null;
    const bit = os.arch().includes('64') ? '64' : '32';
    return join(install, `wallpaper${bit}.exe`);
  }

  isConnected(): boolean {
    const exe = this.exePath;
    return !!exe && existsSync(exe);
  }

  /** 扫描 workshop 目录，构造白名单 */
  listWallpapers(): WallpaperInfo[] {
    const workshop = this.workshopPath;
    if (!workshop || !existsSync(workshop)) return [];
    const result: WallpaperInfo[] = [];
    for (const name of readdirSync(workshop)) {
      const dir = join(workshop, name);
      try {
        if (!statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }
      const pjPath = join(dir, 'project.json');
      if (!existsSync(pjPath)) continue;
      let pj: unknown;
      try {
        pj = JSON.parse(readFileSync(pjPath, 'utf8'));
      } catch {
        continue;
      }
      if (!pj || typeof pj !== 'object' || Array.isArray(pj)) continue;
      const obj = pj as Record<string, unknown>;
      const previewField = typeof obj.preview === 'string' ? obj.preview : null;
      const previewPath =
        previewField && previewField.trim()
          ? join(dir, previewField)
          : null;
      result.push({
        id: name,
        title: typeof obj.title === 'string' && obj.title ? obj.title : '未命名壁纸',
        previewUrl: `/api/v1/wallpaper/preview/${encodeURIComponent(name)}`,
        tags: Array.isArray(obj.tags) ? obj.tags.map((t) => String(t)) : [],
        type: typeof obj.type === 'string' && obj.type ? obj.type : 'Wallpaper',
        projectJsonPath: pjPath,
        previewPath: previewPath && existsSync(previewPath) ? previewPath : null,
      });
    }
    return result;
  }

  /** 读取 config.json 中 Monitor0 的当前壁纸 */
  getCurrent(): WallpaperInfo | null {
    const install = this.installPath;
    if (!install) return null;
    const configPath = join(install, 'config.json');
    if (!existsSync(configPath)) return null;
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    } catch {
      return null;
    }
    if (!config || typeof config !== 'object') return null;
    const userKey = Object.keys(config).find((k) => k !== '?installdirectory');
    if (!userKey) return null;
    const user = config[userKey] as
      | { general?: { wallpaperconfig?: { selectedwallpapers?: Record<string, { file?: unknown }> } } }
      | undefined;
    const selected = user?.general?.wallpaperconfig?.selectedwallpapers;
    if (!selected) return null;
    const monitorKeys = Object.keys(selected).sort();
    if (monitorKeys.length === 0) return null;
    const file = selected[monitorKeys[0]]?.file;
    if (typeof file !== 'string' || !file) return null;
    const list = this.listWallpapers();
    return (
      list.find((w) => {
        // config.json 用正斜杠、Node path 用反斜杠，统一归一化再比对
        const norm = (p: string) => p.replace(/\\/g, '/');
        const dir = norm(dirname(w.projectJsonPath));
        const fileNorm = norm(file);
        return fileNorm === dir || fileNorm.startsWith(`${dir}/`);
      }) ?? null
    );
  }

  getOverview(): WallpaperOverview {
    if (!this.isConnected()) {
      return { connected: false, current: null, wallpapers: [] };
    }
    const wallpapers = this.listWallpapers();
    const current = this.getCurrent();
    return {
      connected: true,
      current: current ? toPublic(current) : null,
      wallpapers: wallpapers.map(toPublic),
    };
  }

  /** 应用壁纸（id 必须命中白名单） */
  async apply(id: string, monitor?: number): Promise<void> {
    if (!this.isConnected()) throw new WallpaperError(502, 'Wallpaper Engine 未连接');
    const hit = this.listWallpapers().find((w) => w.id === id);
    if (!hit) throw new WallpaperError(400, '壁纸不存在或不在白名单');
    const args = ['-control', 'openWallpaper', '-file', hit.projectJsonPath];
    if (typeof monitor === 'number') {
      args.push('-monitor', String(monitor));
    }
    const result = await this.runControl(args);
    if (result.exitCode !== 0) {
      throw new WallpaperError(
        502,
        result.error || `wallpaper64.exe 控制命令返回码 ${result.exitCode}`,
      );
    }
  }

  /** 预览图解析（白名单 + 缺失返回 null） */
  resolvePreview(id: string): { path: string; mime: string } | null {
    const hit = this.listWallpapers().find((w) => w.id === id);
    if (!hit || !hit.previewPath) return null;
    return {
      path: hit.previewPath,
      mime: MIME_BY_EXT[extname(hit.previewPath).toLowerCase()] ?? 'application/octet-stream',
    };
  }

  private runControl(args: string[]): Promise<ControlResult> {
    if (this.opts.control) {
      return this.opts.control(this.exePath ?? '', args);
    }
    const exe = this.exePath;
    if (!exe) return Promise.resolve({ exitCode: -1, error: 'Wallpaper Engine 未连接' });
    const timeoutMs =
      this.opts.controlTimeoutMs ??
      (Number(envValue('ARRODES_WE_CONTROL_TIMEOUT_MS')) || 15000);
    return new Promise((resolve) => {
      let settled = false;
      const child = spawn(exe, args, { windowsHide: true });
      let stderr = '';
      child.stderr?.on('data', (d) => {
        stderr += String(d);
      });
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        resolve({ exitCode: -1, error: 'wallpaper64.exe 控制命令超时' });
      }, timeoutMs);
      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ exitCode: -1, error: err.message });
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ exitCode: code ?? -1, error: stderr.trim() || undefined });
      });
    });
  }
}
