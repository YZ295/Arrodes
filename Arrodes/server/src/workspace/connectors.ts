/**
 * 连接器框架（Agent 工作区）
 *
 * 探测并管理可接入工作区的外部 agent：
 * - native：Arrodes 自身（始终在线）
 * - cli：Hermes / Codex / VS Code（检测命令行可用性）
 * - file：WorkBuddy / Marvis / Crow5（检测目录存在）
 *
 * 每个连接器记录能力（capabilities），供工作区 UI 展示与后续协同路由。
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { execCommand } from '../services/computerService.js';
import { loadCustomAgents, customAgentsFile } from '../services/customAgents.js';

export interface AgentConnector {
  id: string;
  name: string;
  type: 'native' | 'cli' | 'file';
  /** 是否可用（已探测到） */
  available: boolean;
  detail: string;
  /** 能力清单 */
  capabilities: string[];
}

// 本机路径集中管理且可被环境变量覆盖（不硬编码到代码语义中）：
// WORKBUDDY_PATH / MARVIS_KB_PATH / CROW5_ROOT / HERMES_VERSIONS_DIR
const BASE_PATHS = {
  workbuddy: process.env.WORKBUDDY_PATH || 'E:/project/Crow5/Arrodes/.workbuddy',
  marvis: process.env.MARVIS_KB_PATH || 'E:/AI/Marvis/Knowledgebase',
  crow5: process.env.CROW5_ROOT || 'E:/project/Crow5',
};

/** DeepSeek Harness（dsh）CLI 路径（本机安装目录可被 DEEPSEEK_HARNESS_DIR 覆盖） */
const DSH_DIR = process.env.DEEPSEEK_HARNESS_DIR || 'E:/AI/Deep Seek Harness';
const DSH_CMD = `${DSH_DIR}/node_modules/.bin/dsh.cmd`;

/** 桌面版 Hermes runtime 根目录（versions 下按时间取最新） */
const HERMES_VERSIONS_DIR = process.env.HERMES_VERSIONS_DIR || 'E:/AI/Hermes/Hermes Agent CN Desktop/data/versions';
const HERMES_RUNTIME_EXE = 'hermes-agent-cn-runtime-win32-x64.exe';

/** 探测桌面版 Hermes runtime：扫描 versions 目录取最新可用版本（避免硬编码版本号） */
export function findHermesDesktopRuntime(): { exe: string; version: string } | null {
  try {
    if (!existsSync(HERMES_VERSIONS_DIR)) return null;
    const dirs = readdirSync(HERMES_VERSIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((name) => name.startsWith('0.'))
      .sort((a, b) => {
        // 按目录修改时间倒序（最新安装的版本优先）
        const ta = statSync(`${HERMES_VERSIONS_DIR}/${a}`).mtimeMs;
        const tb = statSync(`${HERMES_VERSIONS_DIR}/${b}`).mtimeMs;
        return tb - ta;
      });
    for (const dir of dirs) {
      const exe = `${HERMES_VERSIONS_DIR}/${dir}/${HERMES_RUNTIME_EXE}`;
      if (existsSync(exe)) return { exe, version: dir };
    }
    return null;
  } catch {
    return null;
  }
}

/** 快速检测 CLI 是否可用（2s 超时） */
async function checkCli(command: string): Promise<boolean> {
  try {
    const r = await execCommand(`${command} --version`, { timeoutMs: 2000 });
    return r.exitCode === 0;
  } catch {
    return false;
  }
}

/** 探测自定义 CLI：命令 + 探测参数，退出码 0 或 stdout 非空视为可用 */
async function probeCli(command: string, args: string[]): Promise<boolean> {
  try {
    const r = await execCommand(`"${command}" ${args.join(' ')}`, { timeoutMs: 5000 });
    return r.exitCode === 0 || (r.stdout || '').trim().length > 0;
  } catch {
    return false;
  }
}

/** 探测 Hermes：优先桌面版 runtime（新版），兜底 PATH 中的 hermes 命令 */
async function probeHermes(): Promise<{ available: boolean; version: string; source: 'desktop' | 'cli' | '' }> {
  // 1. 桌面版 runtime（CN Desktop 独立版本体系，优先）
  // 注意：① PyInstaller 启动器 --version 输出正常但 exitCode=-1，以 stdout 解析为准
  //       ② PowerShell 中带引号路径须用 & 调用运算符（路径含空格，否则报"意外的标记"）
  const rt = findHermesDesktopRuntime();
  if (rt) {
    try {
      const r = await execCommand(`& "${rt.exe}" --version`, { timeoutMs: 5000 });
      const v = (r.stdout || '').match(/Hermes Agent v?([\d.]+)/)?.[1] || '';
      if (v) return { available: true, version: rt.version, source: 'desktop' };
    } catch {
      /* 桌面版不可用则继续 */
    }
  }
  // 2. 兜底：PATH 中的 hermes 命令（pip 版）
  try {
    const r = await execCommand('hermes --version', { timeoutMs: 3000 });
    const v = (r.stdout || '').match(/Hermes Agent v?([\d.]+)/)?.[1] || '';
    if (r.exitCode === 0 && v) {
      return { available: true, version: v, source: 'cli' };
    }
  } catch {
    /* ignore */
  }
  return { available: false, version: '', source: '' };
}

/** 探测所有可接入 agent */
export async function detectConnectors(): Promise<AgentConnector[]> {
  const [hermesInfo, codex, vscode] = await Promise.all([
    probeHermes(),
    checkCli('codex'),
    checkCli('code'),
  ]);
  const hermesDetail = hermesInfo.available
    ? (hermesInfo.source === 'desktop'
      ? `Hermes 桌面版 ${hermesInfo.version} 可用（可对话/派任务）`
      : `Hermes CLI v${hermesInfo.version} 可用（可对话/派任务）`)
    : '未检测到 Hermes（桌面版 runtime 或 hermes 命令均不可用）';

  const base: AgentConnector[] = [
    {
      id: 'arrodes',
      name: '阿罗德斯',
      type: 'native',
      available: true,
      detail: '内置主 Agent（对话/记忆/技能/电脑操作）',
      capabilities: ['chat', 'memory', 'skills', 'exec_command', 'file'],
    },
    {
      id: 'hermes',
      name: 'Hermes',
      type: 'cli',
      available: hermesInfo.available,
      detail: hermesDetail,
      capabilities: hermesInfo.available ? ['chat', 'skills', 'exec_command'] : [],
    },
    {
      id: 'codex',
      name: 'Codex',
      type: 'cli',
      available: codex,
      detail: codex ? 'Codex CLI 可用（可派编码任务）' : '未检测到 codex 命令',
      capabilities: codex ? ['chat', 'code', 'exec_command'] : [],
    },
    {
      id: 'vscode',
      name: 'VS Code',
      type: 'cli',
      available: vscode,
      detail: vscode ? 'code 命令可用（可打开/操作编辑器）' : '未检测到 code 命令',
      capabilities: vscode ? ['editor'] : [],
    },
    {
      id: 'workbuddy',
      name: 'WorkBuddy',
      type: 'file',
      available: existsSync(BASE_PATHS.workbuddy),
      detail: existsSync(BASE_PATHS.workbuddy) ? '检测到 .workbuddy 工作目录' : '未检测到 .workbuddy',
      capabilities: existsSync(BASE_PATHS.workbuddy) ? ['file', 'memory'] : [],
    },
    {
      id: 'marvis',
      name: 'Marvis',
      type: 'file',
      available: existsSync(BASE_PATHS.marvis),
      detail: existsSync(BASE_PATHS.marvis) ? '检测到 Marvis 知识库' : '未检测到 Marvis 知识库',
      capabilities: existsSync(BASE_PATHS.marvis) ? ['file', 'memory'] : [],
    },
    {
      id: 'crow5',
      name: 'Crow5',
      type: 'file',
      available: existsSync(BASE_PATHS.crow5),
      detail: existsSync(BASE_PATHS.crow5) ? '检测到 Crow5 项目/技能库' : '未检测到 Crow5 项目',
      capabilities: existsSync(BASE_PATHS.crow5) ? ['skills', 'file'] : [],
    },
  ];

  // DeepSeek Harness（deepseekHarness）
  const dshAvailable = existsSync(DSH_CMD) && await probeCli(DSH_CMD, ['--version']);

  // 配置驱动的自定义 CLI 智能体（data/custom-agents.json）
  const customConfigs = loadCustomAgents(customAgentsFile());
  const custom = await Promise.all(customConfigs.map(async (c) => ({
    c,
    available: await probeCli(c.command, c.probeArgs || ['--version']),
  })));

  return [
    ...base,
    {
      id: 'deepseekHarness',
      name: 'DeepSeek Harness',
      type: 'cli' as const,
      available: dshAvailable,
      detail: dshAvailable ? 'DeepSeek Harness CLI 可用（可对话/派任务，需 DEEPSEEK_API_KEY）' : '未检测到 DeepSeek Harness CLI',
      capabilities: dshAvailable ? ['chat', 'code', 'exec_command'] : [],
    },
    ...custom.map(({ c, available }) => ({
      id: c.id,
      name: c.name,
      type: 'cli' as const,
      available,
      detail: available ? `${c.name} CLI 可用（可对话/派任务）` : `未检测到 ${c.name}`,
      capabilities: available ? (c.capabilities || ['chat']) : [],
    })),
  ];
}
