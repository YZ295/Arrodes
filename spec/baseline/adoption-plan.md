# 接管计划

1. 审计系统结构、行为、测试与风险基线 —— 完成（2026-08-01 baseline，2026-08-12 复核对齐）
2. 用户明确说"批准基线" —— 2026-08-01 已批准；2026-08-12 复核变更后重新批准
3. 以后重构具体模块时，先建立该模块稳定边界的特征测试
4. 技术债与 Bug 分别建立正式变更，不在接管阶段顺手修改（2026-08-12 的用户明确授权修复除外）

## 项目清单

- `Arrodes/server/package.json`（Node + TS + Express + WS + better-sqlite3）
- `Arrodes/client/package.json`（React + Vite + Tailwind + three.js）
- `Arrodes/desktop/package.json`（Electron + electron-builder）
- `Arrodes/tts-sidecar/requirements.txt`（Python + FastAPI + CosyVoice2）
- `TheFool/desktop_pet.py`（PySide6）
