// ============================================================
// 阿罗德斯（Arodes） - 共享类型定义
// ============================================================

// ---- 会话（Session） ----

export type SessionTopic = 'work' | 'life' | 'creative' | 'emotion' | 'study' | 'other';

export interface CreateSessionRequest {
  title: string;
  topic: SessionTopic;
  parentId?: string;
  initialMessage?: string;
}

export interface SessionNode {
  id: string;
  title: string;
  topic: SessionTopic;
  parentId: string | null;
  messageCount: number;
  lastActiveAt: string;
  createdAt: string;
  children?: SessionNode[];
}

export interface SessionDetail extends SessionNode {
  summary: string;
  keyMemories: MemoryNode[];
  messages: Message[];
}

// ---- 消息（Message） ----

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isVoice: boolean;
}

export interface SendMessageRequest {
  content: string;
  isVoice: boolean;
}

export interface SendMessageResponse {
  reply: string;
  memories: MemoryNode[];
  intent?: IntentResult;
}

// ---- 记忆节点（Memory） ----

export type MemoryType = 'fact' | 'preference' | 'event' | 'task';

export interface MemoryNode {
  id: string;
  content: string;
  type: MemoryType;
  createdAt: string;
}

// ---- 意图识别（Intent） ----

export type IntentType =
  | 'new_session'
  | 'switch_session'
  | 'delete_session'
  | 'rename_session'
  | 'search_memory'
  | 'summarize'
  | 'clear_context'
  | 'mute'
  | 'help';

export interface IntentResult {
  type: IntentType;
  params: Record<string, unknown>;
  confidence: number;
}

// ---- 语音（Voice） ----

export interface TranscribeResponse {
  text: string;
  confidence: number;
  language: string;
}

export interface SynthesizeRequest {
  text: string;
  voice?: string;
  speed?: number;
}

export interface SynthesizeResponse {
  audioUrl: string;
  duration: number;
}

// ---- WebSocket 协议 ----

export type WSClientMessageType = 'message';
export type WSServerMessageType = 'chunk' | 'complete' | 'memory' | 'intent' | 'error';

export interface WSClientMessage {
  type: WSClientMessageType;
  sessionId: string;
  content: string;
  isVoice: boolean;
  /** 客户端检测到的意图（Phase 1 透传服务端处理） */
  intent?: IntentResult;
}

export interface WSServerMessage {
  type: WSServerMessageType;
  data: Record<string, unknown>;
}

export interface WSChunkData {
  content: string;
}

export interface WSCompleteData {
  content: string;
  memories: MemoryNode[];
  intent?: IntentResult;
}

export interface WSMemoryData {
  memories: MemoryNode[];
}

export interface WSIntentData {
  type: IntentType;
  params: Record<string, unknown>;
  confidence: number;
}

// ---- API 通用 ----

export interface ApiError {
  error: string;
  code: string;
}

export interface HealthResponse {
  status: 'ok';
  version: string;
}

// ---- 星球（Planet）视觉属性 ----

export const TOPIC_COLORS: Record<SessionTopic, string> = {
  work: '#3B82F6',
  life: '#10B981',
  creative: '#8B5CF6',
  emotion: '#EF4444',
  study: '#F59E0B',
  other: '#6B7280',
};

export const TOPIC_COLOR_HEX: Record<SessionTopic, number> = {
  work: 0x3b82f6,
  life: 0x10b981,
  creative: 0x8b5cf6,
  emotion: 0xef4444,
  study: 0xf59e0b,
  other: 0x6b7280,
};

export const HOME_PLANET_COLOR = '#FFD700';
export const HOME_PLANET_COLOR_HEX = 0xffd700;

// ---- 管道架构 & 插件系统（v4.0） ----
export type {
  PipelineContext,
  PipelineResult,
  PipelineDefinition,
  StageConfig,
  StageOutput,
  SttOutput,
  MemoryRetrievalOutput,
  IntentDetectionOutput,
  LlmInferenceOutput,
  TtsOutput,
  VoicePipelineStage,
} from './pipeline';
export { VOICE_PIPELINE_STAGES } from './pipeline';
export type {
  ArodesPlugin,
  PluginManifest,
  PluginHooks,
  PluginRegistry,
} from './plugin';
