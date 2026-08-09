/**
 * 工作区状态（Zustand）· workspace-v2
 *
 * 管理工作区列表 + 当前激活工作区（localStorage 持久化），
 * 会话/记忆按激活工作区隔离。
 */
import { create } from 'zustand';
import { api } from '../shared/utils/apiClient';

export interface WorkspaceInfo {
  id: string;
  name: string;
  kind: string;
  icon: string;
  status: 'active' | 'archived';
  stats?: { sessions: number; memories: number; wsMemories: number };
}

const LS_KEY = 'arrodes:active_workspace';

function loadInitial(): string {
  try {
    return localStorage.getItem(LS_KEY) || 'default';
  } catch {
    return 'default';
  }
}

export interface WorkspaceState {
  workspaces: WorkspaceInfo[];
  workspacesLoading: boolean;
  workspacesError: string | null;
  activeWorkspaceId: string;
  loadWorkspaces: () => Promise<void>;
  setActiveWorkspace: (id: string) => void;
  createWorkspace: (input: { name: string; kind?: string; icon?: string }) => Promise<WorkspaceInfo | null>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  workspacesLoading: false,
  workspacesError: null,
  activeWorkspaceId: loadInitial(),

  async loadWorkspaces() {
    set({ workspacesLoading: true, workspacesError: null });
    try {
      const d = await api.get<{ workspaces: WorkspaceInfo[] }>('/workspaces');
      const ws = d.workspaces || [];
      set({ workspaces: ws, workspacesLoading: false });
      // 若当前激活的工作区不存在（已归档/删除），回落到默认
      const active = get().activeWorkspaceId;
      if (active !== 'default' && !ws.some((w) => w.id === active)) {
        get().setActiveWorkspace('default');
      }
    } catch (err) {
      set({ workspacesError: err instanceof Error ? err.message : '加载失败', workspacesLoading: false });
    }
  },

  setActiveWorkspace(id: string) {
    set({ activeWorkspaceId: id });
    try { localStorage.setItem(LS_KEY, id); } catch { /* 忽略 */ }
  },

  async createWorkspace(input) {
    try {
      const d = await api.post<{ workspace: WorkspaceInfo }>('/workspaces', input);
      await get().loadWorkspaces();
      return d.workspace;
    } catch {
      return null;
    }
  },
}));
