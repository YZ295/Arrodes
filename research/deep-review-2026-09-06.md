# Arrodes 深度学习报告（2026-09-06，只读审查）

> 三路并行探索：服务端 / 客户端与 UI / 工程化外围。基线：commit 7a3e78b（9/5）+ 工作区 20+ 未提交文件。

## 一、当前架构全景

```
desktop(Electron 43, NSIS)
 └─ client (Vite/React, 5173)
     ├─ Pipeline 架构：core/Pipeline.ts 串行 stages（15s 超时/continueOnError/AbortSignal）
     ├─ voicePipeline: intent→llm→memory→tts + PluginManager 钩子
     ├─ EventBus 全局单例（universe/voice/tts/vision/memory）
     └─ 28 个测试文件
 └─ server (Express + ws, 127.0.0.1:3002)
     ├─ 15 组 /api/v1/* 路由 + WS /v1/chat（requestId 方案A）
     ├─ 30s 主循环：提醒广播 + 每 3 tick 记忆整合
     ├─ Harness：main/memory/dev 三 agent，关键词路由（可关）
     ├─ ~45 个技能（16 文件，registry 统一管线：actionGate→execute）
     ├─ services：MemoryGateway / visionService(deepseek|ollama|magevl) /
     │   ttsService / modelRegistry / workbuddyAdapter / mcpClient
     └─ better-sqlite3 12 张表，幂等迁移
 └─ sidecars：CosyVoice TTS(12001) / Mage-VL 视觉(12002)

测试：server 58 + client 28 = 86 个 vitest 文件
```

## 二、8 月中旬以来的三大变化

### 1. 安全加固（9/4，fb0d7d8，+1188/-247）⭐ 最大变化
- 绑定硬编码 127.0.0.1；生产才托管静态文件
- `ARRODES_LOCAL_TOKEN` 强制 ≥24 字符（timingSafeEqual + Origin 白名单 + 无 Origin 必须带头），覆盖全部 /api 与 WS
- 文件访问：realpath 规范化防逃逸，仅限 workspace allowlist
- actionGate 加 owner 绑定防跨会话确认；vision 加 10MB/格式校验
- TDD 先红后绿，新增 8 组测试

### 2. 黑蓝精密工作台 UI（9/4-9/5）
纯展示层：index.css 变量精简、layoutPolicy 三态布局、statusPresentation 纯函数抽取、composer 聚焦软化（带测试）。

### 3. 工作区未提交改动 = 两个并行 feature（完成度高，接近可提交）
- **持续屏幕观察 + 桌宠投影**：modules/vision/（指纹去重+screenGuidance）、desktop-pet/（BroadcastChannel 投影、透明穿透窗口、?surface=desktop-pet 双入口）、llmStage 注入 visualContext、EventBus 加 VISION_OBSERVATION
- **TTS provider 化 + 可取消播放**：server → cosyvoice3|audio8 多 provider（新 ttsProviders.ts + /api/v1/tts/providers）、speak 全链路 AbortSignal、localStorage 迁移 normalizeStoredProvider

### 4. 规范变化
AGENTS.md（9/4）：取消 Wu5 强制门禁；spec/ 不再是实施前置；仍禁止自动 commit/push/PR。活动变更 frontend-aesthetics 已批准；安全加固已归档闭环。

## 三、风险清单（按优先级）

**P0**
- 打包分发语音未闭环：安装包不含 cosyvoice 模型/conda 环境，终端用户必现「无法连接语音服务」（Knowledge/02 已记载，属已知未解）

**P1**
- `POST /api/v1/skills` 动态注册 + 服务端 fetch 任意 URL → SSRF 可探测本机 sidecar/内网；DELETE /skills/:name 可注销任意内置技能
- useTTS 的 providers 回包与 localStorage 恢复存在时序竞争，可能互相覆盖
- vision-sidecar README 与打包事实矛盾（README 说不分发，extraResources 实际打了脚本+image-only-mamba 桩）
- 根 README 写「本地 CosyVoice2」，实际已是 Fun-CosyVoice3

**P2**
- Harness 关键词路由硬编码脆弱（如 '实现 t'）；deny()/confirm() 等价
- 新旧 TTS provider 枚举硬编码在 3 处，易漂移；桌宠 BroadcastChannel 发布端生命周期未显式清理
- useVoiceChat visualContext 截断无 UI 提示；App.tsx init effect 依赖 [voice] 有重复初始化风险
- progress.md / task_plan.md / findings.md 停在 9/3；uploads/ 未确认 .gitignore 覆盖
- 未提交区建议分组提交：vision+pet / tts / docs 三组

## 四、 Mage-VL sidecar 部署事实（9/4 实测）
- E:/AI/magevl-env：torch 2.5.1+cu121 + transformers 5.16.1 + opencv-python-headless + mamba_ssm 桩包
- E:/AI/HF：权重 10.8GB 完整；sidecar 12002；首次加载 16.8s，纯推理 4.0s/80token，4bit 常驻 4060
- 桌面打包包含 start-magevl.ps1 与 image-only-mamba 桩但无 venv/模型 → 属半分发
