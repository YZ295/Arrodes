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
import { existsSync } from 'node:fs';
import { execCommand } from '../services/computerService.js';

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

const BASE_PATHS = {
  workbuddy: 'E:/project/Crow5/Arrodes/.workbuddy',
  marvis: 'E:/AI/Marvis/Knowledgebase',
  crow5: 'E:/project/Crow5',
};

/** 快速检测 CLI 是否可用（2s 超时） */
async function checkCli(command: string): Promise<boolean> {
  try {
    const r = await execCommand(`${command} --version`, { timeoutMs: 2000 });
    return r.exitCode === 0;
  } catch {
    return false;
  }
}

/** 探测所有可接入 agent */
export async function detectConnectors(): Promise<AgentConnector[]> {
  const [hermes, codex, vscode] = await Promise.all([
    checkCli('hermes'),
    checkCli('codex'),
    checkCli('code'),
  ]);

  return [
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
      available: hermes,
      detail: hermes ? 'Hermes CLI 可用（可对话/派任务）' : '未检测到 hermes 命令',
      capabilities: hermes ? ['chat', 'skills', 'exec_command'] : [],
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
}
