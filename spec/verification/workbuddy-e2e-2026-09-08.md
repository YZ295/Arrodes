# WorkBuddy 网关端到端实测（2026-09-08）

结论：本次真实文件读取任务通过 Codex → localhost:8321 网关 → WorkBuddy 执行 → SSE 回传 → Codex 独立校验。

- 时间：2026-09-08 22:21:11–22:21:20（Asia/Shanghai），约 8.4 秒。
- GET /api/v1/health：200，status=ok。
- POST /api/v1/runs：202 accepted。
- runId：6eebbf53-1544-4d6f-b120-2156b0dd34f7。
- 返回 sessionId：0d6bc220-f9dd-4be3-8b3a-a2511e1de8ac。
- 测试：Codex 新建包含随机 UUID 和两个随机整数的文件；请求中只给路径和求和要求，没有给出 UUID 或整数。WorkBuddy 返回 nonce=854afef8-3e5a-4878-9c3d-80c43d2d5947、sum=10767，与 Codex 本地期望完全一致。
- SSE：HTTP 200，message.status=completed，随后 event: done。
- 最终 GET run 状态：200，active=false。
- 原始响应的 agent.toolCalls 为空，未获得内部工具轨迹；文件内容校验构成实际读取的黑盒证据。

## 证据

- workbuddy-e2e-challenge-2026-09-08.json：本次输入。
- workbuddy-e2e-2026-09-08.evidence.json：请求正文、期望值、runId、HTTP 状态和时间；不含认证凭证。
- workbuddy-e2e-2026-09-08.sse.txt：原始 SSE 响应。

## 验收范围

证明真实短任务可经网关执行并回传，不是手动复制粘贴。未验证网关 session 是否对应用户当前可见的 WorkBuddy 对话，也未验证长任务断线恢复、代码修改、持续自动调度或 Arrodes UI 到适配器的完整入口。本次没有修改应用源码或进行 Git 提交。
