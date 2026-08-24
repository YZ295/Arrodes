/**
 * Agent 对话适配器公共类型（独立文件，避免 codexSdkAdapter 与
 * agentAdapters 之间的模块循环依赖）。
 */

export interface AgentRunOptions {
  cwd: string;
  signal?: AbortSignal;
  /** 有状态会话键（如 workspaceId:agentId）；缺省表示一次性调用 */
  sessionKey?: string;
  /** 工作区权限：default（项目目录内写）| full（全盘） */
  permission?: 'default' | 'full';
}

export interface AgentChatAdapter {
  /** 是否原生有状态（route 层据此决定是否拼接历史） */
  readonly stateful?: boolean;
  run(task: string, opts: AgentRunOptions): Promise<string>;
}

export class AgentAdapterRegistry {
  private map = new Map<string, AgentChatAdapter>();

  register(id: string, adapter: AgentChatAdapter): () => void {
    this.map.set(id, adapter);
    return () => {
      this.map.delete(id);
    };
  }

  get(id: string): AgentChatAdapter | undefined {
    return this.map.get(id);
  }
}
