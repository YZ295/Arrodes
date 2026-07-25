# 持久化 (Persistence)

## 概述
SQLite 本地持久化，Repository 模式封装，REST + WebSocket 双通道读写。

## 数据库 Schema
- `sessions` — 会话元数据（id, title, topic, parent_id, summary, timestamps）
- `messages` — 消息记录（id, session_id, role, content, timestamp, is_voice）
- `memories` — 记忆节点（id, session_id, content, type, created_at）

## 数据访问层
- `SessionRepository` — findAll / findById / create / delete / updateLastActive
- `MessageRepository` — create / findBySessionId
- `MemoryRepository` — create / findBySessionId

## API 接口
- REST `/api/v1/sessions` + `/api/v1/messages` — CRUD 与历史加载
- WebSocket `/v1/chat` — 实时流式消息（chunk → complete）

## 客户端状态
- `useChatStore` (Zustand) — Session CRUD、乐观消息更新、流式追加
- `useUniverseStore` — SessionNode 映射为 PlanetVisualData，驱动 3D 渲染

## 一致性
- 服务端 WS 处理时同步更新 `last_active_at`
- 客户端消息列表与数据库通过 `loadMessages` 回填，避免双源冲突
