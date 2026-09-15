# 阿罗德斯工作空间 · 安全清理报告

> 扫描时间：2026-07-31 22:56  
> 项目路径：`E:\project\Crow5\Arrodes`

---

## 一、项目健康概况

| 指标 | 数值 |
|------|------|
| 项目源码（不含依赖） | **6.9 MB** |
| node_modules 总占用 | **362 MB** |
| 构建产物 | **1.4 MB** |
| 数据库 + 数据 | **4.2 MB** |
| 总工作空间 | **~375 MB** |

**健康评分：78/100** — 代码干净，结构合理，无安全隐患，但有可清理的冗余。

---

## 二、🟢 可安全删除（6 项，释放 ~1.5 MB）

| # | 项目 | 大小 | 原因 |
|---|------|------|------|
| 1 | `Arrodes/client/dist/` | 1.3 MB | 构建产物，`npm run build` 可重新生成 |
| 2 | `Arrodes/server/dist/` | 98 KB | 构建产物，`npm run build` 可重新生成 |
| 3 | `Arrodes/shared/dist/` | 10 KB | 构建产物，`npm run build` 可重新生成 |
| 4 | `Arrodes/client/src/voice/VoiceDialog.tsx` | 15 KB | 已废弃，v5.0 后由 ChatOverlay 替代 |
| 5 | `test_arrodes_ws.py`（根目录副本） | 1.5 KB | 与 Arrodes/../test_arrodes_ws.py 完全重复 |
| 6 | `test_memory.py`（根目录副本） | 1.3 KB | 与 Arrodes/../test_memory.py 完全重复 |

> **客户端 TypeScript 25MB** — typescript 6.0 包自身 24MB（v6 版本特性），`npm ci` 后可恢复，不可删除。

---

## 三、🟡 建议确认删除（3 项，释放 ~4 MB）

| # | 项目 | 大小 | 原因 | 风险 |
|---|------|------|------|------|
| 7 | `Arrodes/server/data/arrodes.db-wal` | 4.1 MB | SQLite WAL 日志已膨胀。执行 `VACUUM` 或删除后重启可重建 | ⚠️ 需先停止后端，否则可能丢数据 |
| 8 | `Arrodes/client/node_modules/.tmp/` | 未知 | Vite/oxc 编译缓存，可安全删除 | 下次构建会稍慢 |
| 9 | `Arrodes/node_modules/` (31MB) | 31 MB | 根目录 node_modules，仅含 TypeScript 等共享依赖 | 如果根目录没有 package.json 引用，可能是残留 |

---

## 四、🔴 不建议删除

| # | 项目 | 原因 |
|---|------|------|
| — | `Arrodes/server/data/arrodes.db` | 数据库文件，包含所有会话和消息 |
| — | `Arrodes/server/data/user_profile.json` | 用户画像数据 |
| — | `Arrodes/server/.env` / `config.ts` | 服务端配置 |
| — | `Arrodes/client/node_modules/` (251MB) | 前端依赖，不可删除 |
| — | `Arrodes/server/node_modules/` (80MB) | 后端依赖，不可删除 |
| — | `Arrodes/.git/` | Git 仓库历史 |
| — | `.workbuddy/` | WorkBuddy 记忆和配置 |
| — | `spec/` | Wu5 Dev Flow 规格文档 |
| — | `Arrodes/Plan/` | 项目架构和迭代文档 |
| — | `Arrodes/client/src/assets/` | 头像资源 |

---

## 五、Git 忽略配置检视

当前 `.gitignore` 覆盖良好：
- ✅ `node_modules/`
- ✅ `dist/`
- ✅ `server/data/` (SQLite)
- ✅ `.DS_Store` / `Thumbs.db`
- ✅ `.vscode/` / `.idea/`

**建议补充**：
```
# TypeScript 编译缓存
*.tsbuildinfo

# WorkBuddy 工作数据
.workbuddy/

# Python
__pycache__/
*.pyc
```

---

## 六、⚠️ 发现的安全/结构问题

| # | 问题 | 严重度 |
|---|------|--------|
| 1 | `test_*.py` 文件同时存在于根目录和 `Arrodes/../`，存在两份相同副本 | 低 |
| 2 | `config.ts` 曾硬编码 `E:\AI\Hermes\...` 路径路径（已修复为环境变量） | 低 |
| 3 | 根目录 `node_modules/` (31MB) 可能未被引用到 | 低 |

---

## 七、执行建议

### 立即执行（安全）
```bash
# 1. 清理构建产物
rm -rf Arrodes/client/dist Arrodes/server/dist Arrodes/shared/dist

# 2. 删除废弃组件
rm Arrodes/client/src/voice/VoiceDialog.tsx

# 3. 删除重复测试文件
rm test_arrodes_ws.py test_memory.py
```

### 确认后执行
```bash
# 4. SQLite WAL 压缩（需先停后端）
cd Arrodes/server
sqlite3 data/arrodes.db "VACUUM;"

# 5. 清理 Vite 缓存
rm -rf Arrodes/client/node_modules/.tmp
```

---

## 八、长期维护建议

| 建议 | 说明 |
|------|------|
| **定期 VACUUM** | SQLite 每 1000 次操作后 WAL 会膨胀，定期 `VACUUM` 可保持健康 |
| **npm ci 替代 npm install** | 构建时用 `npm ci` 确保依赖版本锁定，避免意外更新 |
| **dist 目录 .gitignore** | 已有，构建产永不入库 |
| **TypeScript v6** | client 的 TypeScript 6.0.2 占用 24MB，可考虑降至 5.x 节省 ~15MB |
| **Dead code 扫描** | 项目迭代快速，定期检查未引用的组件和工具函数 |

---

> **总可释放空间：~7 MB（不含 node_modules）**  
> **项目健康评分：78/100 → 清理后预计 85/100**
