/**
 * 管道架构类型定义
 *
 * 参考 AIRI 的 Input → InputProcessor → Output → OutputProcessor 模式
 * 将"输入、推理、执行、反馈"串成清晰的流水线
 *
 * 数据流示意：
 *   User Voice → AudioInput → STT处理器 → LLM推理 → TTS合成 → AudioOutput → 前端播放
 *                             ↑                           ↓
 *                         记忆检索 ←──────────────── 记忆存储
 */
import type { Message, MemoryNode, IntentResult } from './index';

// ============================================================
// 管道阶段
// ============================================================

/** 管道运行上下文——贯穿所有阶段 */
export interface PipelineContext {
  /** 当前会话 ID */
  sessionId: string;
  /** 管道启动时间 */
  startTime: number;
  /** 各阶段可写入的共享数据 */
  state: Record<string, unknown>;
  /** 用户原始输入 */
  rawInput?: string;
  /** 语音 blob（如果有） */
  audioBlob?: Blob;
}

/** 单个阶段的输入 */
export interface StageInput<T = unknown> {
  context: PipelineContext;
  /** 上一阶段的输出（首个阶段为 undefined） */
  previousOutput?: T;
}

/** 单个阶段的输出 */
export interface StageOutput<T = unknown> {
  /** 阶段结果数据 */
  data: T;
  /** 是否继续下一个阶段 */
  continue: boolean;
  /** 阶段耗时 (ms) */
  duration: number;
}

/** 管道阶段处理器 */
export type StageProcessor<TIn = unknown, TOut = unknown> = (
  input: StageInput<TIn>
) => Promise<StageOutput<TOut>>;

// ============================================================
// 管道定义
// ============================================================

/** 阶段配置 */
export interface StageConfig<TIn = unknown, TOut = unknown> {
  /** 阶段名称（用于日志和调试） */
  name: string;
  /** 阶段处理器 */
  processor: StageProcessor<TIn, TOut>;
  /** 阶段超时时间（ms） */
  timeout?: number;
  /** 出错时是否继续 */
  continueOnError?: boolean;
}

/** 管道定义 */
export interface PipelineDefinition {
  /** 管道名称 */
  name: string;
  /** 按序执行的阶段列表 */
  stages: StageConfig[];
  /** 管道完成回调 */
  onComplete?: (ctx: PipelineContext, results: unknown[]) => void;
  /** 管道错误回调 */
  onError?: (ctx: PipelineContext, error: Error, stageName: string) => void;
  /** 管道开始前回调 */
  onStart?: (ctx: PipelineContext) => void;
}

// ============================================================
// 语音对话管道的具体阶段类型
// ============================================================

/** STT 阶段输出 */
export interface SttOutput {
  text: string;
  confidence: number;
  language: string;
}

/** 记忆检索阶段输出 */
export interface MemoryRetrievalOutput {
  memories: MemoryNode[];
  contextHint?: string;
}

/** 意图检测阶段输出 */
export interface IntentDetectionOutput {
  intent?: IntentResult;
  isLocalIntent: boolean;
}

/** LLM 推理阶段输出（流式） */
export interface LlmInferenceOutput {
  /** 完整回复文本 */
  content: string;
  /** 提取的新记忆 */
  newMemories: MemoryNode[];
}

/** TTS 合成阶段输出 */
export interface TtsOutput {
  audioUrl?: string;
  audioBase64?: string;
  contentType?: string;
  duration: number;
}

// ============================================================
// 管道结果
// ============================================================

/** 管道执行结果 */
export interface PipelineResult {
  /** 是否全部成功 */
  success: boolean;
  /** 总耗时 */
  duration: number;
  /** 上下文 */
  context: PipelineContext;
  /** 最终回复 */
  reply: string;
  /** 新记忆 */
  newMemories: MemoryNode[];
  /** 各阶段耗时明细 */
  stageDurations: Record<string, number>;
  /** 失败阶段名 */
  failedStage?: string;
  /** 错误信息 */
  error?: string;
}

// ============================================================
// 语音对话管道：完整的标准处理链
// ============================================================

/**
 * 标准语音对话管道阶段：
 *
 * 1. STT          — 语音 → 文字（AudioInput → STT）
 * 2. Intent       — 文字 → 意图检测
 * 3. MemoryRecall — 文字 → 记忆检索
 * 4. LLM          — 上下文 + 文字 → AI 回复（流式）
 * 5. MemorySave   — 对话 → 记忆提取并存储
 * 6. TTS          — AI 回复 → 语音合成
 */
export const VOICE_PIPELINE_STAGES = [
  'stt',
  'intent',
  'memory_recall',
  'llm',
  'memory_save',
  'tts',
] as const;

export type VoicePipelineStage = (typeof VOICE_PIPELINE_STAGES)[number];
