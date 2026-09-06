# 变更提案：workspace（Agent 工作区 + 电脑操作）

## 目标

1. **操作电脑（优先）**：让阿罗德斯具备本地电脑操作能力——执行命令、读写文件、列目录（安全沙箱）
2. **Agent 工作区（阶段 1 骨架）**：左侧栏新增"工作区"，展示/接入外部 agent（Hermes/Codex/WorkBuddy/VS Code/Marvis/Crow5），共享记忆、互通协同（后续阶段完善）

## 范围（阶段 1）

- server：`computerService`（安全命令执行）+ 电脑操作技能族（exec_command/read_file/write_file/list_dir）
- server：connectors 连接器注册表（Arrodes 自身 + Hermes/Codex 可用性探测）
- server：workspace 共享记忆表 + `/api/v1/workspace` 路由
- client：左侧栏"工作区"视图（agent 节点列表/宇宙占位）

## 安全设计

- 命令黑名单拦截（rm -rf / del / format / shutdown 等），30s 超时，输出 2000 字符截断
- 文件读写限文本 + 1MB 上限；cwd 限制在 Arrodes 项目目录（后续可配置扩大）

## 不做（后续阶段）

- 3D 宇宙完整渲染、agent 间任务委托协议、MCP 接入、WorkBuddy/Marvis 深集成
