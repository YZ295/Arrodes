# 阿罗德斯 · 后端接入 + 环境修复完成

> 日期：2026-07-25
> 状态：✅ 后端已启动，WebSocket 已联通，页面不再闪烁
> 分支：fix/fix3
> 远程仓库：https://github.com/YZ295/Arrodes.git

---

## 一、一句话总结

**后端服务（3001）重新启动，修复了页面闪烁的根因——WebSocket 连接在 StrictMode 下被错误关闭。Canvas 背景色对齐避免白闪。当前前端+后端已可正常通信，会话创建和消息收发均已测试通过。**

---

## 二、问题诊断与修复

### 2.1 🔴 后端服务未启动（核心问题）

| 现象 | 根因 |
|------|------|
| 页面闪烁 | Vite 前端在跑，但 Express+WS 后端(port 3001)停了 |
| 消息发不了 | WebSocket 连不上，`POST /api/v1/sessions` 全挂 |
| Tauri IPC 报错 | 用户本机有 Tauri 浏览器扩展/桌面壳，注入桥接代码——与项目无关 |

**解决**：`npx tsx src/index.ts` 启动后端

```
[Arodes] 服务器已启动 -> http://localhost:3001
[Arodes] WebSocket 路径 -> ws://localhost:3001/v1/chat
```

**验证**：
- `GET /api/health` → `{"status":"ok","version":"0.1.0"}`
- `POST /api/v1/sessions` → `{"id":"47...","title":"test",...}`
- WebSocket 连接/消息收发正常

### 2.2 🔴 WebSocket StrictMode 错误

| 现象 | 根因 |
|------|------|
| `WebSocket connection to 'ws://localhost:3001/v1/chat' failed: WebSocket is closed before the connection is established.` | React StrictMode 在开发环境会挂载→卸载→重挂载组件。第一次的 `useEffect` cleanup 中 `ws?.close()` 在 WebSocket 还在 `CONNECTING` 状态时强行关闭了它 |

**修复**（`useVoiceChat.ts` cleanup）：
```typescript
// 只在 OPEN/CLOSING 时关，CONNECTING 的让浏览器自己收尾
if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CLOSING)) {
  ws.close();
}
```

### 2.3 🟡 Canvas 白闪

| 现象 | 根因 |
|------|------|
| Three.js Canvas 在 StrictMode 重挂载时闪白光 | Canvas 默认背景是黑色，页面背景是 `#0a0e27`，两不匹配 |

**修复**（`Universe.tsx`）：
```tsx
<Canvas style={{ background: '#0a0e27' }}
  onCreated={({ gl }) => { gl.setClearColor('#0a0e27'); }}
>
```

---

## 三、当前能力基线

| 能力 | 状态 | 说明 |
|------|------|------|
| 后端 Express 服务 | ✅ | Port 3001，API + WebSocket |
| 会话 CRUD | ✅ | POST/GET/DELETE 通过 SQLite 持久化 |
| WebSocket 消息 | ✅ | 收发正常，占位回复 |
| API 健康检查 | ✅ | `/api/health` 正常 |
| 前端 3D 宇宙 | ✅ | 无闪白，无闪烁 |
| 语音对话（录音→STT→发送→回复→TTS） | ✅ | 本地闭环，不依赖后端 |
| 新建会话意图检测 | ✅ | 关键词匹配 + 事件总线 |
| 会话间切换（事件驱动） | ✅ | `VOICE_SESSION_SWITCH` 事件 |
| 真实 LLM 回复 | ❌ | 当前是占位回复 |
| 生长动画 | ❌ | 无，下一轮目标 |
| TypeScript 编译校验 | ❌ | 未执行 `npx tsc --noEmit` |

---

## 四、启动方式

```bash
# 终端 1：后端
cd E:\project\Crow5\Arrodes\Arrodes\server
npx tsx src/index.ts

# 终端 2：前端
cd E:\project\Crow5\Arrodes\Arrodes\client
npm run dev

# 浏览器打开
http://localhost:5173
```

---

## 五、已知残留问题

| 问题 | 影响 | 优先级 |
|------|------|--------|
| Tauri IPC/CSP 报错 | 控制台噪音，不影响功能 | P3 — 用户本机环境问题 |
| StrictMode 下 `hasInitializedSession` 竞态 | 极端情况可能创建两个 session | P3 — 仅 dev 模式偶发 |
| 后端无 keep-alive/ping | WS 可能因防火墙超时断开 | P2 — 开发环境够用 |
| Vite proxy 的 `/v1/chat` 未使用 | 前端直接连 `ws://localhost:3001`，没走 proxy | P3 — 部署时注意 |
| `npx tsc --noEmit` 未跑 | 可能有类型错误 | P1 — 下一轮开头执行 |

---

## 六、Git 状态快照

```
分支: fix/fix3
最新 commit: a060818
远端: origin/fix/fix3 (已同步)
工作区: ⚠️ 有未提交更改（上文的修复代码）
```

**未提交的改动**：
- `client/src/voice/hooks/useVoiceChat.ts` — WebSocket cleanup 修复
- `client/src/universe/Universe.tsx` — Canvas 背景色对齐
- `client/src/universe/SolarSystem.tsx` — 改为使用 store position，不再自算轨道
- `client/src/universe/CameraController.tsx` — 改为 useFrame 逐帧平滑飞行

---

## 七、下一轮建议（MVP 第 2 轮）

```
1. npx tsc --noEmit                      # 类型校验
2. 生长动画 SpawnAnimation.tsx            # 光束+粒子+凝聚
3. useVoiceChat.ts + intentDetector.ts    # 新建会话意图→事件联动
4. 完整链路：语音→动画→自动切会话        # 开盒即用
```

> **远端仓库**：https://github.com/YZ295/Arrodes.git
