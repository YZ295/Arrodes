/**
 * 用量统计与额度管控服务
 *
 * 职责：
 * - 记录每次 LLM 调用的 token 消耗（精确值优先，缺失时估算）
 * - 按日/月聚合用量，对照限额（TOKEN_DAILY_LIMIT / TOKEN_MONTHLY_LIMIT）拦截超额调用
 *
 * 对应 Agent 开发基准第 4 条：Token 设置调用额度上限，管控运行成本。
 */
import { UsageRepository } from '../db/usage-repo.js';
import { config } from '../config.js';

export interface UsageStats {
  daily: { used: number; limit: number; remaining: number };
  monthly: { used: number; limit: number; remaining: number };
  allowed: boolean;
  reason?: string;
}

export class UsageService {
  private repo = new UsageRepository();

  /** 记录一次调用消耗 */
  recordUsage(input: {
    modelId: string;
    sessionId?: string | null;
    promptTokens: number;
    completionTokens: number;
    estimated?: boolean;
  }): void {
    try {
      this.repo.create(input);
    } catch (err) {
      console.error('[Usage] 记录用量失败:', err);
    }
  }

  /** 当前用量与额度状态 */
  getStats(): UsageStats {
    const dailyUsed = this.repo.todayTotal();
    const monthlyUsed = this.repo.monthTotal();

    const daily = {
      used: dailyUsed,
      limit: config.tokenDailyLimit,
      remaining: Math.max(0, config.tokenDailyLimit - dailyUsed),
    };
    const monthly = {
      used: monthlyUsed,
      limit: config.tokenMonthlyLimit,
      remaining: Math.max(0, config.tokenMonthlyLimit - monthlyUsed),
    };

    let allowed = true;
    let reason: string | undefined;
    if (dailyUsed >= config.tokenDailyLimit) {
      allowed = false;
      reason = `今日 Token 额度已用尽（${dailyUsed.toLocaleString()} / ${config.tokenDailyLimit.toLocaleString()}），请明日再试或调高 TOKEN_DAILY_LIMIT。`;
    } else if (monthlyUsed >= config.tokenMonthlyLimit) {
      allowed = false;
      reason = `本月 Token 额度已用尽（${monthlyUsed.toLocaleString()} / ${config.tokenMonthlyLimit.toLocaleString()}），请下月再试或调高 TOKEN_MONTHLY_LIMIT。`;
    }

    return { daily, monthly, allowed, reason };
  }

  /** 调用前检查：是否允许继续消耗额度 */
  checkLimit(): { allowed: boolean; reason?: string } {
    const stats = this.getStats();
    return { allowed: stats.allowed, reason: stats.reason };
  }

  recent(limit = 20) {
    return this.repo.recent(limit);
  }
}

export const usageService = new UsageService();
