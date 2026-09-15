# Arrodes 任务拆解（to-tickets 阶段 · v2）

> 输入：business-spec v2（grill-me 六共识 + to-spec 四拍板）。每张 ticket 可独立验收，映射到 spec 规则号。

---

## 里程碑 M0：测试基建 + 回归锁定（P0）

### T1. 引入 vitest 测试基础设施
- **目标**：server 可跑自动化测试；后续所有改动有回归兜底
- **改动点**：server 安装 vitest；package.json 加 `test` 脚本；vitest 配置（node 环境）
- **验收**：`cd server && npm test` 跑通一个示例测试；`npm run typecheck` 通过
- **依赖**：无（先决条件）
- **对应 spec**：非功能需求"可测试性"

### T2. 为"归档/恢复"补回归测试
- **目标**：归档、恢复、过期回收行为被测试锁定
- **前置**：db connection 支持内存库注入（`:memory:`）
- **改动点**：server/src/db/connection.ts（注入改造）+ session-repo.test.ts
- **验收**：测试覆盖 archive/unarchive/autoArchiveStale；`findAll` 默认过滤已归档（修复现缺口）；`npm test` 全绿
- **依赖**：T1
- **对应 spec**：R7、R8

### T3. 为"停止机制"补回归测试
- **目标**：三重停止（语音/推理/任务）不被回归破坏
- **改动点**：server ws handler 测试（mock llmService）+ client llmStage 测试（abort 触发 reject）
- **验收**：cancel 消息 → LLM 流中止 → 不发 complete；abort → reject('cancelled')；`npm test` 全绿
- **依赖**：T1
- **对应 spec**：R1-R3

### T4. 为"语音合成重试"补回归测试
- **目标**：指数退避重试（5 次上限）行为被锁定
- **改动点**：server ttsService 测试（mock 合成器）
- **验收**：失败重试 5 次、成功后停止重试、5 次失败后抛错；`npm test` 全绿
- **依赖**：T1
- **对应 spec**：R12

---

## 里程碑 M1：协议与架构修复（P1）

### T5. WS 协议升级：requestId 消息关联（方案 A）
- **目标**：消除 llmStage 劫持全局回调；并发对话不串线
- **改动点**：shared 类型（消息加 requestId）；server ws handler（事件回带 requestId）；client MessageChannel（按 id 派发）+ llmStage（按 id 认领，删 `as any`）
- **验收**：两并发请求事件互不串线；llmStage 无 `as any`；TS 严格模式通过；`npm test` 全绿
- **依赖**：T3（先有停止回归，防改造破坏）
- **对应 spec**：R4 + 3.4

### T6. 引入 zod 校验，替换手写 validate.ts
- **目标**：请求体强类型校验；前后端共享 schema
- **改动点**：shared 加 zod schema（sessions/messages/tts 等）；server 路由替换 validateBody
- **验收**：非法请求返回 400 + 明确错误；类型由 z.infer 推导；`npm test` 全绿
- **依赖**：T1
- **对应 spec**：R11

### T7. 移除云端语音引擎（纯本地）
- **目标**：去掉 Edge TTS 依赖，只保留本地 CosyVoice
- **改动点**：server ttsService（删 edge 分支/云端音色列表）；client useTTS（降级链改单引擎）；ttsService 测试同步
- **验收**：TTS 请求仅走本地引擎；云端相关代码/配置/音色删除；`npm test` 全绿
- **依赖**：T4（先锁定重试行为）
- **对应 spec**：R5（纯本地）+ 边界"不依赖云端"

### T8. 语音输出开关（静音）
- **目标**：用户可随时关闭语音播报，AI 只显示文字
- **改动点**：client useTTS（实现 isMuted 状态：关闭时不请求合成、不播放）；ChatOverlay（静音按钮 UI）；持久化开关状态
- **验收**：关闭后对话无语音请求、无播放；重新开启恢复播报；开关状态刷新后保持；`npm test` 全绿
- **依赖**：T7（纯本地后开关语义清晰）
- **对应 spec**：R6

---

## 里程碑 M2：体验增强（P2）

### T9. 自定义音色（上传参考音频克隆）
- **目标**：用户上传 3-10 秒音频，克隆专属声源
- **改动点**：server 新路由（音频上传+校验）；cosyVoiceProxy（zero_shot 声源切换）；client 设置面板（音色管理 UI）
- **验收**：上传音频后可试听/选用该音色合成；音频格式/时长校验（3-10s）；失败返回明确错误
- **依赖**：T7（纯本地引擎稳定后）
- **对应 spec**：2.4 音色自定义

### T10. useVoiceChat 巨型 hook 拆分
- **目标**：按职责拆（会话/消息/停止/录音），可独立测试
- **改动点**：client voice/hooks/ 拆分
- **验收**：拆分后行为不变；各子 hook 可独立单测
- **依赖**：T5（协议稳定后）
- **对应 spec**：非功能"可维护性"

### T11. 归档会话恢复入口优化
- **目标**：归档视图恢复操作直观可用
- **改动点**：client Sidebar（归档标签页恢复按钮强化）
- **验收**：归档标签下每个会话可一键恢复；恢复后回到会话标签并高亮
- **依赖**：T2（后端恢复已验证）
- **对应 spec**：R8

---

## 依赖图

```
T1（基建）
 ├→ T2 归档回归
 ├→ T3 停止回归 ──→ T5 requestId 协议 ──→ T10 hook 拆分
 ├→ T4 重试回归 ──→ T7 移除云端 ──→ T8 静音开关
 └→ T6 zod 校验
T7 ──→ T9 自定义音色
T2 ──→ T11 恢复入口
```

并行组：{T2, T3, T4, T6} 可并行（均仅依赖 T1）；T5/T7/T8/T9 串行；T10/T11 独立。

## 推荐执行顺序

1. **M0**：T1 → T2/T3/T4/T6（并行）——先锁定现有行为 + 校验层
2. **M1**：T5（协议）→ T7（纯本地）→ T8（静音）——架构主线
3. **M2**：T9/T10/T11（体验，可并行）

## 对应 spec 规则全覆盖核对

- R1-R3 停止 → T3 ✅
- R4 防串线 → T5 ✅
- R5 纯本地 → T7 ✅
- R6 静音 → T8 ✅
- R7/R8 归档恢复 → T2/T11 ✅
- R9 记忆异步 → 现有实现（无测试，M2 后可补）
- R10 记忆单一网关 → 已执行（删 memoryService）✅
- R11 校验 → T6 ✅
- R12 重试 → T4 ✅
