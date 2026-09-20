# 悬浮语音管家 M0/M1 Tickets

> 2026-09-10 · 依据 `research/pet-frontend-form-requirements-2026-09-10.md` v1.1 拆解
> 代码勘察基线：Butler/client 现有语音链路 = 按住说话（useVoiceRecorder → `/api/v1/stt/transcribe`）→ ws → 主 agent → useTTS 播报；server STT 已有双策略（默认 SiliconFlow 云端 / 可切本地 faster-whisper 侧车 `server/scripts/stt_sidecar.py`）；EmotionBall 引擎（`client/public/emotion-ball/js/`）已有 setGaze 与状态→表情映射。

## 里程碑语义（项目自定义，覆盖 skill 默认）

- **M0 = 小球闭环验证**：静默在场 + 直接开口 + 表情目光/粒子光环，全部跑在本机现有管线上（livekit-agnostic）
- **M1 = 全双工/形态进化**：是否引入 livekit 由 M0 实测数据决定（T11 决策门）

---

## M0 · 语音线（P0）

### T1. 回归锁定现有语音链路
- **里程碑**：M0 ｜ **优先级**：P0 ｜ **依赖**：无
- **目标**：改免提前，先测试锁住现有"按住说话→STT→ws→回复→TTS 播报"行为，防止重构改坏。
- **改动点**：`Butler/client/src/desktop-pet/usePetChat.test.tsx`（新增）；`Butler/server/test/`（stt 路由回归）；`Butler/client/src/voice/hooks/useTTS` 现有测试确认覆盖 stop/播报事件。
- **验收标准**：`npm test`（client + server）全绿；新增用例覆盖：会话复用（`arrodes_desktop_pet_session`）、录音提交→转写→消息发送的 happy path。

### T6. 免提链路强制本地 STT（隐私前置）
- **里程碑**：M0 ｜ **优先级**：P0 ｜ **依赖**：无（需在 T2 启用前完成）
- **目标**：always-on 麦克风不能连云端——免提链路的转写强制走本地 faster-whisper 侧车；主窗口"按住说话"保持现状（用户主动行为，可留云端）。
- **改动点**：`Butler/client/src/desktop-pet/usePetChat.ts`（STT 请求带 `provider=local` 或专用端点）；`Butler/server/src/routes/stt.ts`（接受 provider 覆盖参数）。
- **验收标准**：免提录音请求到达 server 时 provider=local（单测断言）；`stt_sidecar.py` 未运行时给出明确错误而非静默回落云端。

### T2. 直接开口：always-on VAD 免提模式
- **里程碑**：M0 ｜ **优先级**：P0 ｜ **依赖**：T1、T6
- **目标**：pet 窗口默认免提——VAD 检测到说话自动录音，静默自动截止提交，替代"按住说话"；双手不离键盘。
- **改动点**：`Butler/client/src/modules/voice/useVAD.ts`（暴露 onSpeechStart/onSpeechEnd）；`Butler/client/src/voice/hooks/useVoiceRecorder.ts`（自动开始/停止模式）；`Butler/client/src/desktop-pet/usePetChat.ts`（免提开关，localStorage 记忆）。
- **验收标准**：说话→自动转写→发出消息全链路通；VAD 阈值/静默时长参数化（默认值防键盘声/环境噪声误触发）；静音态（见 T4）下 VAD 零采集（单测 + 手动验证）。

### T3. 半双工回声治理
- **里程碑**：M0 ｜ **优先级**：P0 ｜ **依赖**：T2
- **目标**：pet 说话时挂起采集，否则它听自己播报产生自激。播报期间 VAD 暂停 + 丢弃音频缓冲，播完恢复监听。
- **改动点**：`Butler/client/src/voice/hooks/useTTS.ts`（播报开始/结束事件，`TTS_PLAY_END` 已存在于 eventBus）；`Butler/client/src/modules/voice/useVAD.ts`（suspend/resume）。
- **验收标准**：播报期间不产生任何用户消息（单测模拟播报期间喂入音频事件）；播报结束 ≤500ms 恢复监听。

### T4. 球体操作面：单击静音 + 点击打断
- **里程碑**：M0 ｜ **优先级**：P0 ｜ **依赖**：T2、T3
- **目标**：球体表面只留两个语音相关操作——单击（非播报中）=麦克风静音/恢复切换；播报中点击 = 打断（立即停播 + 中断生成）。
- **改动点**：`Butler/client/src/desktop-pet/DesktopPetOverlay.tsx`（点击判定：播报中→打断，否则→静音切换）；`Butler/client/src/voice/hooks/useTTS.ts`（stop 已有，需中断进行中的 LLM 流）；`Butler/client/src/desktop-pet/usePetChat.ts`（AbortController 贯穿）。
- **验收标准**：点击打断 ≤200ms 停止播报（performance.now 断言）；打断后 ws 消息流中止（不产生"它还在说"的残留回复）；静音态有可见表情/光环指示（联动 T7/T9）。

### T5. 目光跟随
- **里程碑**：M0 ｜ **优先级**：P1 ｜ **依赖**：无（可与语音线并行）
- **目标**：目光跟随全局光标——"余光里它看着你工作"。
- **改动点**：`Butler/desktop/main.ts`（screen.getCursorScreenPoint 轮询 timer，默认 10Hz 可配）；`Butler/desktop/petPreload.cts`（IPC `pet:gaze`）；`Butler/client/src/desktop-pet/useGazeBridge.ts`（新增，IPC → EmotionBall setGaze 适配）。
- **验收标准**：光标移动后 ≤250ms 朝向更新（手动）；轮询暂停条件：窗口隐藏/静音态；CPU 增量 <1%。

---

## M0 · 视觉线（P1）

### T7. 在场/对话状态机扩展
- **里程碑**：M0 ｜ **优先级**：P1 ｜ **依赖**：T2
- **目标**：desktopPetState 增加 `listening / thinking / speaking / muted` 四态与迁移规则；对话结束 30s 无话自动回归在场态。
- **改动点**：`Butler/client/src/desktop-pet/desktopPetState.ts`（createDesktopPetViewModel 扩展）；`desktopPetState.test.ts`。
- **验收标准**：状态迁移单测全覆盖（含 30s 回归计时器、静音优先级最高）；无非法迁移路径。

### T9. 表情三态接线
- **里程碑**：M0 ｜ **优先级**：P1 ｜ **依赖**：T7
- **目标**：四态映射到 EmotionBall 表情——listening→录音35（已有）、thinking→思考30（已有）、speaking→回复39（已有）、muted→静音新指示（rings 调暗或从现有 emotion 集合选定）。
- **改动点**：`Butler/client/src/desktop-pet/DesktopPetOverlay.tsx`（状态→emotion id 传给引擎）；muted 表情资产确认/选定。
- **验收标准**：每态切换单测 + 手动目检四态表情正确。

### T8. 粒子光环层（terseai 技法自研）
- **里程碑**：M0 ｜ **优先级**：P1 ｜ **依赖**：T7（消费状态事件）；与 T9 并行
- **目标**：EmotionBall 外圈新增数据驱动粒子光环（raw WebGL 1 自研，小视口 1-3k 粒子）：thinking=脉动、speaking=涟漪、muted=呼吸减慢、观察=微光。**法律约束：不搬运 terse-field.js 代码（无许可），只参考其公开技法（点阵渲染/Canvas2D 文字掩膜/编舞状态机/降级策略）。**
- **改动点**：`Butler/client/src/desktop-pet/ParticleAura.ts`（新增，自包含 IIFE，仅暴露 mount/setState/destroy）；编舞选择器做成纯函数便于单测；`DesktopPetOverlay.tsx` 挂载。
- **验收标准**：30fps 封顶；`visibilitychange` 隐藏即暂停（rAF 停）；`prefers-reduced-motion` → 回退纯球体；编舞选择器单测全绿；桌宠进程 GPU 占用增量 <5%（任务管理器对照），qwen3-vl 推理不受影响。

---

## M0 · 汇聚

### T10. M0 验收联测
- **里程碑**：M0 ｜ **优先级**：P0 ｜ **依赖**：T3、T4、T5、T8、T9
- **目标**：需求文档 §7 验收清单逐条实测并留痕（含 GPU/loopback 隐私验证），产出验收记录作为 T11 决策输入。
- **改动点**：验收记录写入 `research/pet-frontend-form-requirements-2026-09-10.md` 附录或独立验收笔记。
- **验收标准**：§7 全部顶层条目均勾选（当前 7 条，其中粒子条目含多项复合断言）；不通过项降级记录并给出 M1 处理建议。

---

## M1 · 提纲（待 T10 数据后细化，不排期）

### T11.（决策门）livekit 全双工评估
- 依据 M0 实测（回声残留/打断延迟/误触发率/半双工体感）决定：引入 livekit server+worker（按需求文档 §4/§5 拓扑）或维持半双工长期运行。产出决策记录。
### T12. livekit server 自托管引入
- 本机 loopback 部署 + 端口按 Butler 纪律登记 + .env 管理。前置：T11 通过。
### T13. agent worker sidecar（Python）
- AgentSession + 复用 faster-whisper + 灵语 TTS 自定义插件包装 + Ollama LLM；复用 sidecar 模式（第三个 sidecar）。前置：T12。
### T14. 桌宠窗口接 livekit-client
- WebRTC loopback 接入 + session 事件→表情/光环桥替换半双工逻辑。前置：T13。
### T15. 唤醒词决策
- openWakeWord（Apache-2.0）本地外挂 vs 维持"VAD+静音键"；含误触发率实测。前置：T11。
### T16. 粒子引擎 M1 演进
- GLYPH 粒子短句层（状态词显示）等，视 M0 在场感反馈决定。前置：T10 反馈。

---

## 依赖图与并行组

```
语音线:  T1 ──→ T2 ──→ T3 ──→ T4 ──┐
              ↑                    │
         T6(隐私前置)              │
状态线:  T7 ──→ T9 ──┐            │
视觉线:  T8 ────────┤            ├─→ T10 M0联测 ──→ T11(M1决策门) ──→ T12→T13→T14
独立:    T5(目光) ──┘            │                        └→ T15 / T16
```

- **并行组 A**（语音线）：T1 → T6+T2 → T3 → T4
- **并行组 B**（视觉线，与 A 并行）：T7 → T9 与 T8
- **独立**：T5 随时可做
- **汇聚**：T10；M1 全线 gated by T11

## 推荐执行顺序

1. T1（半天，锁回归）→ 2. T6 + T2（免提核心）→ 3. T3（回声，免提可用前提）→ 4. T4（操作面）∥ T7 → 5. T9 ∥ T8（视觉线）→ 6. T5 → 7. T10 联测 → 拿数据开 T11
