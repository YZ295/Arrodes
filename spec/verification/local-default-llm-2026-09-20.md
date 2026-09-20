# Butler Local Default LLM Verification — 2026-09-20

## 目标

将 Butler 的默认对话模型从失效的 DeepSeek 配置切换为本机 Ollama `qwen3-vl:4b-instruct`，复用已经运行的视觉模型，不要求 API Key；连接失败时显示真实、可操作的错误。

## RED

- 命令：`npx vitest run src/services/modelRegistry.test.ts src/services/llmProvider.test.ts`
- 结果：退出 1；新增默认模型用例与无效 `ACTIVE_MODEL` 回退用例均收到 `deepseek-v4-flash`，期望为 `ollama-qwen3-vl-4b`。
- 错误提示用例单独运行时退出 1；`formatLlmFailure` 不存在，证明旧代码没有可操作的本地模型错误转换。

## GREEN

- 增加内置模型 `ollama-qwen3-vl-4b`：`http://127.0.0.1:11434/v1`、`qwen3-vl:4b-instruct`、`requiresKey=false`。
- 默认模型和无效配置回退均指向本地 Ollama；项目级与用户级 `ACTIVE_MODEL` 同步为该模型。
- 本地请求不发送 `Authorization`；云端模型仍保留为手动选择项。
- Ollama 错误显示底层原因，并提示检查服务与模型；云端错误保留供应商和状态。
- 定向测试：2 个文件，11 项通过。
- 服务端全量测试：60 个文件，367 项通过。
- `npm run typecheck`：退出 0。
- `npm run build`：退出 0。

## 真实运行证据

- 桌宠重新启动后，应用服务监听 `127.0.0.1:3003`，Ollama 监听 `127.0.0.1:11434`，视觉侧车监听 `127.0.0.1:12012`。
- 从服务端编译产物读取到：`id=ollama-qwen3-vl-4b`、`provider=Ollama（本地）`、`requiresKey=false`。
- 使用编译后的 `DeepSeekLlmProvider`（OpenAI 兼容协议实现）向真实 Ollama 发起流式请求，返回“阿罗德斯本地对话正常”，错误为空。

## 边界

- 本轮只修改 Butler；Agent 副本未同步。
- 本地 4B 模型适合日常桌宠对话和屏幕指导，复杂推理能力不等同于大型云端模型；云端模型入口仍保留。
