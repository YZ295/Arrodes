/**
 * PetStatusStore：桌宠（TheFool）状态源
 *
 * 轻量内存存储：记录阿罗德斯"当前正在做什么" + "最近完成的任务结果"，
 * 供桌宠通过 HTTP 轮询展示。
 *
 * 写入点：WS handler 处理消息时 updateTask；harness 完成后 updateResult。
 */
interface PetStatus {
  /** 当前任务描述（AI 正在处理中） */
  task: string | null;
  /** 最近完成任务的结果摘要 */
  lastResult: string | null;
  /** 结果时间戳 */
  lastResultAt: string | null;
  /** 是否正在处理 */
  busy: boolean;
}

const state: PetStatus = {
  task: null,
  lastResult: null,
  lastResultAt: null,
  busy: false,
};

export function updatePetTask(task: string | null): void {
  state.task = task;
  state.busy = !!task;
}

export function updatePetResult(result: string): void {
  state.lastResult = result.slice(0, 200); // 截断，气泡显示友好
  state.lastResultAt = new Date().toISOString();
  state.task = null;
  state.busy = false;
}

export function getPetStatus(): PetStatus {
  return { ...state };
}
