# TDD 实施规划（/implement 前置）

> 目标：为 M0 的三张回归测试 ticket（T3/T4/T5）建立"先写失败测试 → 实现 → 重构"的闭环。

---

## 1. 工具链选型

| 层 | 工具 | 理由 |
|----|------|------|
| server | **vitest** | 已有 tsx，vitest 原生支持 TS/ESM；better-sqlite3 可注入内存库 |
| client | **vitest + @testing-library/react** | 与 server 统一心智；组件/hook 可测 |
| shared | vitest（纯类型，可低配） | 类型测试成本低 |
| desktop | vitest（主进程逻辑） | fork/waitForPort 可 mock |

**server vitest 关键配置**：
- `environment: 'node'`
- DB 用 `:memory:`（connection.ts 需支持注入 dbPath——T4 前置小改动）
- llmService mock：`vi.mock` 掉 fetch 层

## 2. 每张 ticket 的 TDD 步骤

### T3 - 停止机制回归测试
**红（先写）**：
```ts
// server/src/ws/handler.test.ts
it('收到 cancel 后不发 complete', async () => {
  // mock llmService.chatStream 永不完成 + 监听 ws.send
  // 发送 message → 发送 cancel → 断言无 complete 消息
});
it('cancel 中断流式读取', async () => {
  // mock fetch 返回可中断 reader，断言 abort 触发
});
```
```ts
// client/src/pipeline/stages/llmStage.test.ts
it('abort 信号触发 reject(cancelled)', () => {
  // 创建 AbortController，监听 abort，断言 reject
});
```
**绿**：当前实现已含此逻辑 → 直接跑通
**重构**：抽 `createAbortableLlmWaiter` 消除重复

### T4 - 归档回归测试
**红**：
```ts
// server/src/db/session-repo.test.ts
it('archive 后 findAll 默认过滤', () => { ... });
it('unarchive 恢复可见', () => { ... });
it('autoArchiveStale 只回收超期未活跃会话', () => { ... });
```
**前置改动**：`connection.ts` 支持 `new Database(':memory:')` 注入（当前 getDb 单例硬编码路径）
**绿**：现有实现应通过；**发现**：`findAll` 当前未过滤 archived——需补 `WHERE archived=0`（实现缺口，正好 TDD 暴露）

### T5 - TTS 降级链回归测试
**红**：
```ts
// server/src/services/ttsService.test.ts
it('edge 失败自动降级 local', async () => { ... });
it('串行队列：并发请求排队不并行', () => { ... });
it('5 次重试后仍失败才抛错', () => { ... });
```
**绿**：现有实现应通过；**发现**：队列锁实现需可注入（便于测并发）

## 3. 测试目录约定

```
server/src/**/*.test.ts        （与被测文件同目录）
client/src/**/*.test.tsx
```

## 4. 需要安装的依赖（待用户确认下载）

```bash
# server
cd server && npm i -D vitest

# client
cd client && npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

## 5. 实施顺序

1. T2（基建）→ 2. T4（归档，含 connection 注入改造）→ 3. T3（停止）→ 4. T5（降级链）
> T4 先行：它暴露 `findAll` 未过滤 archived 的缺口，且改动最小。
