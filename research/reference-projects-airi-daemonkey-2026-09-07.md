# 参考项目研究：AIRI 与 Daemonkey（2026-09-07）

> 研究目的：为 Arrodes 桌宠/桌面 Agent 方向（米米、屏幕观察、记忆、技能系统）寻找可借鉴架构。
> 两个项目定位互补：**AIRI = 跨端虚拟角色的"身体"层蓝本；Daemonkey = 本地守护进程的"灵魂"层蓝本。**

---

## 一、AIRI（GitHub: moeru-ai/airi，MIT 系生态）

**定位**：自托管开源 AI 伴侣（复刻 Neuro-sama），"耳朵-大脑-嘴巴-身体"分层。

### 架构分层
```
应用层：stage-web / stage-tamagotchi(Electron桌面) / stage-pocket(移动 PWA+Capacitor)
   ↓ 共享
共享包：stage-ui / core-agent / core-character / pipelines-audio / stage-ui-live2d / stage-ui-three / server-sdk
   ↓ 服务通道
桌面服务通道：server-runtime
集成层：discord-bot / minecraft-bot / Telegram / MCP（经 SDK 挂载，不直接耦合）
托管后端：Caddy(边缘) → api-server / auth-server → PostgreSQL / Redis
```

### 技术栈
- Vue 3 + TS monorepo（pnpm + Turborepo），Vitest 含浏览器端测试
- Web 基座：WebGPU / WebAudio / WASM / WebSocket；Three.js（stage-ui-three）、three-mmd
- 桌面：Electron（electron-vite），性能关键路径回退原生 **NVIDIA CUDA / Apple Metal**（借 HuggingFace candle）
- LLM 层：自研轻量 SDK **xsai**（类 Vercel AI SDK），兼容 30+ 供应商
- 记忆：**DuckDB WASM / pglite 全客户端嵌入式数据库** + Drizzle ORM（隐私优先，无云依赖）
- 语音：VAD + STT + LLM + TTS 独立成 `pipelines-audio` 包；本地 Kokoro TTS

### 对 Arrodes 最有价值的 6 个设计
1. **UI 与渲染引擎解耦**：Live2D 渲染器、Three.js/VRM 渲染器各自独立包——对应我们的 `VITE_PET_VISUAL` 三态视觉，方向一致，可进一步把 vrmPet/live2dPet/ProceduralPet 拆成独立渲染器包
2. **Electron 多窗口 + BroadcastChannel 状态同步**：设置窗与舞台窗分离，用**可序列化 Live2D 表情快照 + owner ID 防陈旧窗口**——正是我们 desktopPetBridge 的进阶版（加 owner ID 校验）
3. **原生 GPU 保性能**：Web 壳 + 原生 CUDA 推理，对应我们 Mage-VL sidecar 的取舍（他们用 candle，我们用 transformers）
4. **集成走 SDK 通道**：Discord/Minecraft 等经 server-sdk 统一协议接入，核心不耦合——对应 Arrodes 的技能/插件体系
5. **"拟生命"细节清单**：自动眨眼、自动注视、待机眼球运动、点击穿透（macOS/Windows）、流式文本+字素集群动画——多数我们已实现，**注视（gaze tracking）和字素级流式动画还没做**
6. **记忆全客户端**：嵌入式 DB 本地记忆，无云端依赖——与我们 SQLite 方向一致，可参考其表设计

---

## 二、Daemonkey（Gitee: vaan21th/dae-monkey，AGPL-3.0）

**定位**：本地 AI 搭档守护进程（daemon）。"记得你、把话落成文件、房间里有它"。Python 3.10+ / FastAPI / OpenAI 兼容接口 / 纯本地文件存储。

### 核心模块
| 模块 | 职责 |
|---|---|
| soul_loader | 每轮把画像+记忆+宪法装进上下文 |
| tool_loop | 模型调工具，三层信任门 |
| daemon_api | FastAPI 后端 |
| session | 每轮会话管理 |
| 记忆星图 | 手册和记忆聚成星系（可视化记忆索引） |

### 五条技能扩展路径（"七十二变"）
Playbooks（操作手册）/ Studio Apps（说一句话生成应用）/ MCP servers / 手写 agent_tools / 导入外部 SKILL——外加**能力发现引擎**（自己上网找新能力）。

### 三条产品宪法（写进基因约束每个判断）
闭环（Closed-Loop）/ NLP 优先（NLP-First）/ 可追溯（Traceability）。

### 记忆系统（最值得抄的部分）
1. **前缀缓存优化**：每轮不变的说明书放前面、易变内容（时间/进度）放最后 → 磁盘前缀缓存命中 **95%+**，长对话成本大降
2. **工具目录分级**：常用 35 个工具全文进说明书（0.88 万 token），其余 92 个只列名字（目录 8113 字）按需展开——工具目录远低于 OpenClaw 的 1.8 万上限
3. **画像分层**：改说话风格的短条目每轮必载，流水账按需召回——实测每轮常驻 token **减少 68%**
4. **记忆写入门槛**：先挡不该记的；召回先全文检索、再模型精排；**被拒绝过的记忆下次排前**（负反馈学习）
5. **ATM-Bench 实测**：多轮自主翻记忆 + 二次重排 = **51.6%**，对比一次性关键词搜索 9.7%、OpenCode 官方 38.3%（同一模型 deepseek-v4-flash，差距全在架构）

### 自修复/自升级
- `repair.bat` 维修台：自己诊断、修复、验证
- `ROLLBACK.bat` 一键回滚上一可用内核
- 官方升级只换程序，**永不触碰用户记忆与文件**
- 增量升级源（Gitee 主 + GitHub 备份）

### 多载体路线
Web UI（已实现）→ 终端 → 微信/飞书 → 桌面机器人（roadmap）。"换外壳，同一个灵魂。"

---

## 三、对 Arrodes 的具体启发清单（供 Codex 排期参考）

### 高优先（直接对应现有痛点）
1. **前缀缓存优化**（Daemonkey）：我们 30 秒主循环 + 33+ 技能的提示词可重排——稳定段前置、易变段后置，配合 DeepSeek 前缀缓存降成本
2. **工具目录分级**（Daemonkey）：技能目录只列名字按需展开，缓解主循环 token 膨胀
3. **观察频率可调**（已做）+ 播报期间暂停（已有）——AIRI 的"说话检测"思路可进一步做"屏幕观察让位于对话"
4. **gaze 注视追踪**（AIRI）：VRM 模型视线跟随鼠标/摄像头，拟生命感提升明显，three-vrm 原生支持 lookAt

### 中优先
5. **owner ID 防陈旧窗口**（AIRI）：desktopPetBridge 快照加 owner 校验，多窗口/重开场景更稳
6. **记忆写入门槛 + 负反馈排序**（Daemonkey）：SQLite 记忆表加"拒答权重"字段
7. **自修复台**（Daemonkey）：桌宠模式加"自检"按钮——诊断后端/sidecar/端口/模型状态并给修复建议

### 远期
8. **多载体**（Daemonkey）：微信/飞书进消息（Arrodes 已有 WS 基础）
9. **能力发现引擎**（Daemonkey）：让 Agent 自己上网找 MCP/SKILL 并接入
10. **记忆星图可视化**（Daemonkey）：记忆索引的星系图 UI，与我们的星空主题契合

---

## 四、许可注意
- AIRI：MIT 系生态，可自由借鉴架构
- **Daemonkey：AGPL-3.0**——只能**学习设计思路**，直接复制代码会传染 AGPL 协议到 Arrodes（MIT）。借鉴思想 OK，抄代码不行。
