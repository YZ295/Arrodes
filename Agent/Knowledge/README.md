---
title: 阿罗德斯（Arrodes）知识库
tags: [index, moc, arrodes]
created: 2026-08-09
---

# 🧠 阿罗德斯（Arrodes）知识库

> 持续运行的桌面语音 AI Agent —— 本地记忆 + 本地语音 + 多 Agent 路由。
> 本库沉淀项目的架构、模块、运维与借鉴来源，供开发与排查使用。

## 📇 知识地图（MOC）

| 主题 | 文档 | 一句话 |
|------|------|--------|
| 🏠 总览 | [[00-项目总览]] | 定位、技术栈、启动方式、端口 |
| 🏗️ 架构 | [[01-架构与模块]] | server / client / sidecar / 桌宠 / desktop 五层 |
| 🎙️ 语音 | [[02-语音系统]] | CosyVoice 侧车、TTS 链路、故障排查 |
| 🧠 记忆 | [[03-记忆系统]] | 提取/召回/去重/显式指令 |
| 🛠️ 技能 | [[04-技能与工具]] | 技能注册机制 + 全量清单 |
| 🤖 Agent | [[05-Agent系统]] | harness 编排 + 意图路由 + 三 Agent |
| 📚 借鉴 | [[06-参考项目借鉴]] | BaiLongma / HoloJarvis / Prime Agent |
| 🚢 工程 | [[07-工程与发布]] | 测试、构建、打包、CI、发布 |

## 🗂️ 目录结构

```
Arrodes/
├── server/          # Node/TS 后端（Express + WS + better-sqlite3）
├── client/          # React 前端（Vite + Tailwind）
├── tts-sidecar/     # Python CosyVoice2 语音侧车（FastAPI, 12001）
├── TheFool/         # Python 桌宠（PyQt6, 独立 exe）
├── desktop/         # Electron 桌面壳（打包发布）
├── Plan/            # 执行计划文档（master-plan 等）
└── Knowledge/       # 📍 本知识库
```

## 🔧 快速速查

- **启动后端**：`cd server && NODE_ENV=production PORT=3002 node dist/index.js`
- **侧车**：`conda run -n cosyvoice python tts-sidecar/tts_sidecar.py --port 12001`（后端会自动懒启动，一般无需手动）
- **前端**：`cd client && npm run dev`（或访问打包版 http://localhost:3002）
- **测试**：`cd server && npx vitest run`（69+ 测试）
- **打包桌面版**：`cd desktop && npm run dist`（产物 release*/）

---
*由开发过程持续沉淀 · 最后更新 2026-08-09*
