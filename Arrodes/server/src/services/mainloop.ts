/**
 * mainloop：阿罗德斯主循环（借鉴 BaiLongma 持续运行 Agent 理念）
 *
 * 让 Agent 从"纯被动应答"升级为"持续运行"：
 * - 空闲心跳：周期性 tick，检查到期提醒、整理记忆、广播状态
 * - 每 30s 执行一次（与请求链路隔离，不阻塞对话）
 *
 * 注：这是轻量版主循环——不引入复杂调度，只做高价值后台维护。
 */
import type { WebSocketServer } from 'ws';
import { pollDueReminders } from '../skills/reminder.js';
import { consolidateMemories } from './MemoryGateway.js';
import { updatePetTask, updatePetResult } from './petStatus.js';

const TICK_INTERVAL_MS = 30_000;

/** 主循环状态（供诊断/测试） */
export interface MainloopState {
  started: boolean;
  lastTickAt: string | null;
  tickCount: number;
  lastConsolidate: { scanned: number; removed: number } | null;
}

const state: MainloopState = {
  started: false,
  lastTickAt: null,
  tickCount: 0,
  lastConsolidate: null,
};

/**
 * 单次 tick：到期提醒推送 + 记忆整理（BaiLongma 式主动记忆维护）
 * @param wss WebSocket 服务器（提醒推送用；无则跳过推送）
 * @param tickNow 当前时间（可注入测试）
 */
export async function runTick(wss: WebSocketServer | null = null, tickNow = Date.now()): Promise<MainloopState> {
  state.tickCount++;
  state.lastTickAt = new Date(tickNow).toISOString();

  // 1. 到期提醒推送（复用 reminder 技能轮询）
  try {
    const due = pollDueReminders(tickNow);
    if (due.length > 0 && wss) {
      const msg = JSON.stringify({
        type: 'reminder',
        data: { text: due[0].text, dueAt: due[0].dueAt },
      });
      for (const ws of (wss as unknown as { clients: Set<{ readyState: number; send: (d: string) => void }> }).clients || []) {
        if (ws.readyState === 1) ws.send(msg); // 1 = ws.OPEN
      }
      updatePetResult(`⏰ 提醒：${due[0].text}`);
    }
  } catch (err) {
    console.warn('[Mainloop] 提醒轮询失败:', err);
  }

  // 2. 主动记忆整理（去重合并；每 3 次 tick 做一次，避免频繁 DB 写）
  if (state.tickCount % 3 === 0) {
    try {
      state.lastConsolidate = await consolidateMemories();
      if (state.lastConsolidate.removed > 0) {
        console.log(
          `[Mainloop] 记忆整理：扫描 ${state.lastConsolidate.scanned} 条，合并删除 ${state.lastConsolidate.removed} 条重复`,
        );
      }
    } catch (err) {
      console.warn('[Mainloop] 记忆整理失败:', err);
    }
  }

  return { ...state };
}

/** 启动主循环（幂等：只启动一次） */
export function startMainloop(wss: WebSocketServer | null = null): void {
  if (state.started) return;
  state.started = true;
  console.log(`[Mainloop] 主循环启动（每 ${TICK_INTERVAL_MS / 1000}s tick）`);

  setInterval(() => {
    void runTick(wss);
  }, TICK_INTERVAL_MS);
}

/** 获取主循环状态（诊断/测试） */
export function getMainloopState(): MainloopState {
  return { ...state, lastConsolidate: state.lastConsolidate ? { ...state.lastConsolidate } : null };
}
