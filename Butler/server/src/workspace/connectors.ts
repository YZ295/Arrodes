import { resolve } from 'node:path';
/**
 * 连接器框架（Agent 工作区）
 *
 * 探测并管理可接入工作区的外部 agent：
 * - native：Arrodes 自身（始终在线）
 * - cli：Codex / VS Code（检测命令行可用性）
 * - file：WorkBuddy / Marvis / Crow5（检测目录存在）
 *
 * 每个连接器记录能力（capabilities），供工作区 UI 展示与后续协同路由。
 * 注意：外部 agent 只是"使用者"，记忆读写统一走阿罗德斯记忆入口，不各自持有记忆。
 */
import { existsSync } from 'node:fs';
import { execCommand } from '../services/computerService.js';
import { loadCustomAgents, customAgentsFile } from '../services/customAgents.js';
import { probeWorkbuddyGateway } from '../services/workbuddyAdapter.js';

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
// WORKBUDDY_PATH / MARVIS_KB_PATH / CROW5_ROOT
const BASE_PATHS = {
  workbuddy: process.env.WORKBUDDY_PATH || resolve(process.cwd(), '../.workbuddy'),
  marvis: process.env.MARVIS_KB_PATH || 'E:/AI/Marvis/Knowledgebase',
  crow5: process.env.CROW5_ROOT || 'E:/project/Crow5',
};

/** DeepSeek Harness（dsh）CLI 路径（本机安装目录可被 DEEPSEEK_HARNESS_DIR 覆盖） */
const DSH_DIR = process.env.DEEPSEEK_HARNESS_DIR || 'E:/AI/Deep Seek Harness';
const DSH_CMD = `${DSH_DIR}/node_modules/.bin/dsh.cmd`;

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
    // PowerShell 里带引号的路径需要 & 调用运算符（cmd.exe 不需要，这里统一补上）
    const prefix = /[\\/]/.test(command) ? '& ' : '';
    const r = await execCommand(`${prefix}"${command}" ${args.join(' ')}`, { timeoutMs: 5000 });
    return r.exitCode === 0 || (r.stdout || '').trim().length > 0;
  } catch {
    return false;
  }
}

/** 探测所有可接入 agent */
export async function detectConnectors(): Promise<AgentConnector[]> {
  const [codex, vscode] = await Promise.all([
    checkCli('codex'),
    checkCli('code'),
  ]);
  const workbuddyDir = existsSync(BASE_PATHS.workbuddy);
  const workbuddyGateway = await probeWorkbuddyGateway();
  const workbuddyTokenConfigured = Boolean(process.env.WORKBUDDY_GATEWAY_TOKEN);
  const workbuddyCapabilities = workbuddyDir ? ['file', 'memory'] : [];
  if (workbuddyGateway) workbuddyCapabilities.push('chat');

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
      available: workbuddyDir,
      detail: workbuddyDir
        ? (workbuddyGateway
          ? (workbuddyTokenConfigured
            ? '检测到 .workbuddy 工作目录 + 本地网关在线（可对话）'
            : '检测到 .workbuddy 工作目录 + 本地网关在线（可对话，需 token）')
          : '检测到 .workbuddy 工作目录（网关未在线，仅记忆导入）')
        : '未检测到 .workbuddy',
      capabilities: workbuddyCapabilities,
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

  // DeepSeek Harness（deepseekHarness）：文件存在即视为可用（已确认 CLI 可运行）
  const dshAvailable = existsSync(DSH_CMD);

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
