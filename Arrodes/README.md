# 阿罗德斯 Arrodes 🧠🎙️

> 持续运行的桌面语音 AI Agent —— **本地记忆 · 本地语音 · 多 Agent 路由**

阿罗德斯不是普通聊天机器人：它像一个**常驻桌面管家**，30 秒主循环主动工作（检查提醒、整理记忆、刷新状态），本地 CosyVoice2 语音合成（离线、免费、隐私不出本机），按意图把任务分发给专门的 Agent，还能搭配独立桌宠实时播报任务进度。

## ✨ 功能特性

- 🎙️ **语音优先**：纯本地 CosyVoice2 合成（零成本/离线/隐私），自定义音色克隆 + 失败自动回退
- 🧠 **长期记忆**：SQLite 记忆库 + 会话总结 + 用户画像；主动去重合并（Dice 相似度）、召回排序、人物识别
- ⏱️ **主循环驱动**：30s tick —— 到期提醒推送 / 定期记忆整理 / 状态广播（"活"着的 Agent）
- 🤖 **多 Agent 路由**：main（对话）/ memory（记忆）/ dev（开发工作流）按意图分发，可开关回滚
- 🛠️ **33+ 技能**：报时 / 天气（Open-Meteo 免 key）/ 提醒 / 联网搜索 / 文件操作 / 记忆管理 / 开发工作流（code-review 等）
- 💬 **显式记忆指令**："记住 X" / "忘了 X" 直达记忆库，秒回不走 LLM
- 🖥️ **三形态**：Web / Electron 桌面版 / 独立桌宠（TheFool）
- 🎨 **状态色联动**：聆听蓝 / 思考金 / 说话青，一眼感知 Agent 状态
- ⚙️ **可精炼 Prompt 外壳**：人设核心不可变 + 补充提示版本化可回滚

## 🏗️ 架构总览

```
┌─────────────────────────────────────────────────┐
│  Electron 桌面壳 (desktop/) · fork 后端子进程     │
└────────────────────┬────────────────────────────┘
┌────────────────────▼────────────────────────────┐
│  Server (server/ · Node+TS · :3002)             │
│  REST /api/v1/*  +  WebSocket /v1/chat          │
│  Harness(Agent路由) · MemoryGateway · Mainloop  │
└──────┬───────────────────────────┬──────────────┘
┌──────▼──────────┐        ┌────────▼─────────────┐
│ Client (React)  │        │ TTS Sidecar (Python) │
│ 语音/聊天/面板   │        │ CosyVoice2 · :12001  │
└─────────────────┘        └──────────────────────┘
```

## 🧰 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Node.js + TypeScript + Express + WebSocket + better-sqlite3 |
| 前端 | React + Vite + TailwindCSS + thinking-orbs |
| 语音 | Python + FastAPI + CosyVoice2（conda 环境） |
| 桌宠 | Python + PyQt6（PyInstaller 打包） |
| 桌面壳 | Electron + electron-builder（NSIS） |
| 质量 | Vitest（69+ 测试）+ GitHub Actions CI |

## 🚀 快速开始

### 环境要求
- Node.js ≥ 22
- Python 3.10 conda 环境 `cosyvoice`（语音侧车）
- CosyVoice2-0.5B 模型权重（约 5.3GB）

### 安装与启动

```bash
# 1. 安装依赖
cd server && npm install
cd ../client && npm install

# 2. 配置模型 API Key（复制示例）
cp server/.env.example server/.env
# 编辑 .env 填入你的 LLM API Key

# 3. 语音侧车（首次自动拉起，也可手动）
conda run -n cosyvoice python tts-sidecar/tts_sidecar.py --port 12001

# 4. 启动后端（生产模式，托管前端构建产物）
cd server && NODE_ENV=production PORT=3002 node dist/index.js

# 5.（可选）前端开发模式
cd client && npm run dev
```

打开 http://localhost:3002 即可对话。

### 模型权重下载（语音侧车）

```bash
# 方式一：ModelScope（推荐，国内快）
modelscope download --model iic/CosyVoice2-0.5B --local_dir tts-sidecar/CosyVoice-unzip/cosyvoice-main/pretrained_models/CosyVoice2-0.5B

# 方式二：HuggingFace
huggingface-cli download --local-dir tts-sidecar/CosyVoice-unzip/cosyvoice-main/pretrained_models/CosyVoice2-0.5B FunAudioLLM/CosyVoice2-0.5B
```

## 🧪 测试

```bash
cd server && npx vitest run src/services/ src/harness/ src/skills/
cd server && npx vitest run src/db/ src/ws/ src/middleware/
```

## 📦 打包发布

```bash
# 桌面安装包（Electron + NSIS）
cd desktop && npm run dist

# 桌宠独立 exe
cd TheFool && python -m PyInstaller --onefile --windowed --name "桌宠-愚者" \
  --add-data "character_transparent.png;." desktop_pet.py
```

## 📁 项目结构

```
├── server/          # Node 后端（REST + WS + 记忆 + 主循环 + 技能）
├── client/          # React 前端
├── tts-sidecar/     # CosyVoice2 语音侧车（FastAPI）
├── TheFool/         # 桌宠（PyQt6）
├── desktop/         # Electron 桌面壳
├── Plan/            # 执行计划文档
└── Knowledge/       # 项目知识库（Obsidian 格式）
```

## 🤝 致谢与借鉴

本项目的架构理念借鉴了三个优秀的开源项目：
- [BaiLongma](https://github.com/YZ295/BaiLongma) —— 持续运行桌面 Agent（主循环/记忆整理/人物卡片）
- HoloJarvis —— 语音管家（显式记忆指令/TTS 回退/状态色）
- Prime Agent —— 自我改进编码 Agent（Prompt 分层/CI 纪律）

## 📄 License

尚未指定 License，保留所有权利。如需开源协议（如 MIT/Apache-2.0），请作者在发布前添加。

> 本文件为子目录文档；仓库根 [LICENSE](../../LICENSE) 已采用 MIT 协议。

---
*项目知识库见 `Knowledge/`（Obsidian 格式，含架构/语音/记忆/技能/Agent/工程文档）*
