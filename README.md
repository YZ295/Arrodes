# 阿罗德斯 Arrodes 🧠🎙️

> 持续运行的桌面语音 AI Agent —— **本地记忆 · 本地语音 · 多 Agent 路由**

阿罗德斯不是普通聊天机器人：它像一个**常驻桌面管家**，30 秒主循环主动工作（检查提醒、整理记忆、刷新状态），本地 CosyVoice2 语音合成（离线、免费、隐私不出本机），按意图把任务分发给专门的 Agent，还能搭配独立桌宠实时播报任务进度。

## 📁 仓库结构

```
├── Arrodes/              # 项目主体（server 后端 + client 前端 + desktop 桌面壳）
│   ├── server/           #   Node 后端：REST + WS + 记忆 + 主循环 + 33+ 技能
│   ├── client/           #   React 前端（语音/聊天/记忆面板/模型设置）
│   ├── desktop/          #   Electron 桌面壳（NSIS 安装包）
│   ├── tts-sidecar/      #   CosyVoice2 语音侧车（FastAPI）
│   ├── Knowledge/        #   项目知识库（Obsidian 格式）
│   └── README.md         #   详细文档（架构/快速开始/打包）
├── TheFool/              # 桌宠（PyQt6，独立 exe）
├── spec/                 # 规格文档（行为基线/变更记录）
└── AGENTS.md             # 多智能体协作契约
```

**详细文档见 [Arrodes/README.md](Arrodes/README.md)**（功能、架构图、快速开始、测试、打包发布）。

## ✨ 核心特性

- 🎙️ **语音优先**：纯本地 CosyVoice2 合成（零成本/离线/隐私），自定义音色克隆 + 失败自动回退
- 🧠 **长期记忆**：SQLite 记忆库 + 主动去重合并（Dice 相似度）+ 召回排序 + 人物识别
- ⏱️ **主循环驱动**：30s tick —— 到期提醒推送 / 定期记忆整理 / 状态广播
- 🤖 **多 Agent 路由**：main（对话）/ memory（记忆）/ dev（开发工作流）按意图分发，可开关回滚
- 💬 **显式记忆指令**："记住 X" / "忘了 X" 直达记忆库，秒回不走 LLM
- 🖥️ **三形态**：Web / Electron 桌面版 / 独立桌宠（TheFool）
- 🎨 **状态色联动**：聆听蓝 / 思考金 / 说话青，一眼感知 Agent 状态

## 🧰 技术栈

后端 Node.js + TypeScript + Express + WebSocket + better-sqlite3 · 前端 React + Vite + TailwindCSS · 语音 Python + FastAPI + CosyVoice2 · 桌宠 PyQt6 · 桌面 Electron + electron-builder · 质量 Vitest + GitHub Actions CI

## 🚀 快速开始（详见 Arrodes/README.md）

```bash
# 1. 依赖
cd Arrodes/server && npm install && cd ../client && npm install
# 2. 模型 Key
cp Arrodes/server/.env.example Arrodes/server/.env   # 填入 LLM API Key
# 3. 启动（语音侧车首次自动拉起）
cd Arrodes/server && NODE_ENV=production PORT=3002 node dist/index.js
# 打开 http://localhost:3002
```

## 🤝 致谢

架构理念借鉴 [BaiLongma](https://github.com/YZ295/BaiLongma)（持续运行 Agent）、HoloJarvis（语音管家）、Prime Agent（自我改进编码 Agent）。

## 📄 License

尚未指定 License，保留所有权利。如需开源协议（如 MIT/Apache-2.0），请在发布前添加。
