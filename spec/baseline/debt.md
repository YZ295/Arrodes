# 基线债务（2026-08-12 复核版）

## 结构与文档债务

- SQLite 无正式迁移机制（initSchema 幂等建表 + 存量列 ALTER）
- 前端 `core/` 与 `pipeline/` 双套架构并存，责任边界未完全收敛
- spec 早期文档（features/persistence、voice-loop）与当前 Harness 版实现有出入，以代码为准
- `Arrodes/Plan/` 被 gitignore 部分跟踪（旧文档已入库、新文档不入库）——用户明确该目录用于跨 AI 认知同步，保持现状
- desktop 打包分发未验证（electron-builder 已升级至 26.15.3，需真实打包验证）
