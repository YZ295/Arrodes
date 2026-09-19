# 候选记忆审核 UI 验证（2026-09-19）

## 范围

- Butler 控制台增加“记忆审核”入口。
- 列出候选记忆的类型、来源、证据和可信度。
- 支持逐条确认或拒绝；成功后移出队列，失败时保留并显示可重试错误。
- 确认操作调用既有 `POST /api/v1/workspace/memories/:id/confirm`，记录随后属于
  Obsidian 同步集合；本功能不擅自触发批量同步。

## TDD 证据

### RED

命令：

```text
node node_modules/vitest/vitest.mjs run src/components/MemoryPanel.test.tsx
node node_modules/vitest/vitest.mjs run src/ButlerWorkspace.test.tsx
```

结果：候选审核用例 2/2 失败（没有“待审核”区域和审核按钮）；控制台入口用例
1/1 失败（没有“记忆审核”导航）。失败原因均为目标功能不存在。

### GREEN

命令：

```text
node node_modules/vitest/vitest.mjs run src/ButlerWorkspace.test.tsx src/components/MemoryPanel.test.tsx
```

结果：2 个测试文件、3 个测试全部通过，退出码 0。

## 回归与构建

- Butler 客户端全量：31 个测试文件、205 个测试全部通过，退出码 0。
- `npm run lint`：退出码 0；仅保留项目原有警告。
- `node node_modules/vite/bin/vite.js build`：生产 bundle 构建通过；保留原有大 chunk 警告。
- `npm run build`：被已有 `continuousVision.test.ts` 两处 `structuredFallback`
  类型错误阻塞，与本次记忆 UI 无关；未修改旧测试掩盖该基线问题。
- Impeccable 检查发现一处旧删除按钮的灰字/红底对比问题，已在同一轮修正。
