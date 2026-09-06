# 持久化 (Persistence)

## 概述
SQLite 本地持久化，Repository 模式封装，REST + WebSocket 双通道读写。

## 数据库 Schema
- `sessions` — 会话元数据（id, title, topic, parent_id, summary, timestamps）
- `messages` — 消息记录（id, session_id, role, content, timestamp, is_voice）
- `memories` — 记忆节点（id, session_id, content, type, created_at）

## 数据访问层
- `SessionRepository` — findAll / findById / create / delete / updateLastActive / updateSummary
- `MessageRepository` — findBySession / create / deleteBySession
- `MemoryRepository` — findBySession / create / delete / search

## API 接口
- REST `/api/v1/sessions` + `/api/v1/messages` — CRUD 与历史加载
- WebSocket `/v1/chat` — 实时流式消息（chunk → complete）

## 客户端状态
- `useChatStore` (Zustand) — Session CRUD、乐观消息更新、流式追加
- `useUniverseStore` — SessionNode 映射为 PlanetVisualData，驱动 3D 渲染

## 级联与约束
- `ON DELETE CASCADE`：删除 session 时级联删除 messages / memories
- `journal_mode = WAL` + `foreign_keys = ON`

## 缺失项
- 无迁移脚本，schema 变更需手动处理
- 无连接池与事务封装
- 后端回复为占位文本，待 Phase 1 接入 LLM
