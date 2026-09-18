# 屏幕观察最小闭环 · 真机验收（2026-09-18）

> 状态：**部分执行，结论不通过**。已用用户真实屏幕帧完成一次端到端验证，
> 发现的三个缺陷中 2 个已修（缺陷二待真机复验）、1 个待决。

## 本轮使用的真实证据

用户 2026-09-18 20:21 提供的屏幕截图（Arduino IDE 2.3.10 + Arduino Uno）：

```
Sketch uses 2004 bytes (6%) of program storage space. Maximum is 32256 bytes.
Global variables use 188 bytes (6%) of dynamic memory, leaving 1860 bytes for local variables.
Error: cannot open port \\.\COM5
Error: unable to open port COM5 for programmer arduino
Failed uploading: uploading error: exit status 1
```

**关键结构：编译成功，上传失败。** 这正是验收文档要求区分、而旧实现没有区分的场景。

同一帧还提供第二条证据：阿罗德斯自己的面板出现在观察画面里
（模型 `visibleText` 抓到 `Blink 编译已完成` / `当前屏幕中` / `当鼠标移至`）。

## 缺陷一：上传失败被误判为编译失败（已修）

### 现象

旧规则用单一「error 桶」判定：`/\berror\b/i` 命中 `Error: cannot open port`，
`/exit status [1-9]/i` 命中 `Failed uploading: ... exit status 1`。于是返回

```
currentStep = 编译失败
nextAction  = 先查看输出面板中的第一条 error，并修正代码后重新编译。
```

**输出面板里根本没有编译错误**，代码是好的。这条指引把用户推向错误方向：
去改一个没问题的 sketch，而真正的原因是 COM5 打不开（板子/端口问题）。

### 根因

判定只看「文字里有没有 error」，不区分 Arduino 工作流的阶段。
`exit status 1` 是 Arduino CLI 的通用失败标记，**编译和上传都会出现**，
单看它无法区分——旧实现却把它当成了编译失败的证据。

### 修复

在 `screenGuidance.ts` 中把**上传阶段失败**拆成独立分支，并**先于**编译失败判定：

```ts
const UPLOAD_FAILURE_PATTERNS = [
  /failed uploading/i, /uploading error/i, /unable to open port/i,
  /cannot open port/i, /can't open (device|port)/i, /ser_open\(\)/i,
  /programmer is not responding/i, /上传失败/,
];
```

刻意**不**收录 `/avrdude/i`：verbose 模式下上传成功也会打印 avrdude 输出，
收进去会把成功帧误判成失败。

判定顺序（顺序本身即逻辑）：

1. 上传失败 → `blocked`，「开发板或串口没连上…**代码本身没有问题，不用改**」
2. 编译失败 → `blocked`，「先查看输出面板中的第一条 error…」
3. 上传成功 → `advance`
4. 编译成功 → `advance`，「点击上传按钮…」
5. 否则 → `wait`

第 1 步放在第 2 步之前是关键：只有先分流掉上传失败，`exit status 1` 才不歧义。

### 验证

真实截图 → 真实 Ollama（qwen3-vl:4b-instruct，14.3 秒）→ 修复后判定：

```
currentStep      = 上传失败
decision         = blocked
nextAction       = 开发板或串口没连上：确认 USB 线已插好、开发板已上电，
                   并在开发板选择器里选中正确端口后重新上传。代码本身没有问题，不用改。
expectedEvidence = ["Done uploading."]
```

值得注意的是**模型自己判成了「编译失败」**（其 summary 写「Arduino IDE 编译失败，
无法打开 COM 端口」），而可见证据规则正确覆盖了模型判断——这正是
「可见证据必须覆盖与之冲突的模型判断」这条设计意图在工作。

新增 3 项回归测试（用真实帧结构）：

- 编译成功 + 上传失败 → 上传失败，且指引不含「修正代码」
- 真编译错误 → 仍为编译失败（反向保护，防止过度纠偏）
- 上传成功帧 → `advance`，不被新分支误伤（守门）

## 缺陷二：系统读自己的文字，把自己「确认」成完成了（已修，待真机复验）

### 现象

```
evidenceMatches("Done uploading.", ["还没有出现上一步期望的「Done uploading.」，继续等待画面变化。"])
  => true
verifyPreviousStep(...) => confirmed
basis => 画面中出现了上一步期望的「Done uploading.」，上一步已完成。
```

**系统读到自己的「还没出现」提示，判定「上一步已完成」。** 凭空造出任务进展。

### 根因（两个缺陷叠加）

1. **自我观测未排除**：`setObservationExclusion` 机制存在，但只注册了
   **桌宠窗口**边界（`usePetBoundsListener` → `pet-bounds`），
   **主窗口/面板没有被排除**。阿罗德斯面板常驻最上层，屏幕共享时必然入镜。
2. **自己写的文字被当成屏幕证据**：`taskSession` 的验证文案把期望证据的
   **字面量**嵌进了句子（三种状态的 basis 都嵌了），而 `evidenceMatches`
   是纯子串匹配，不区分来源。

后果不止于伪造一次：`confirmed` 的 basis 同样含该字面量，下一轮可继续自我确认，
形成自持循环。

### 为什么是 P1

验收文档的失败条件直接命中：

- 「系统不跳步，不在相同画面上重复推进」
- 「点击操作被当成成功结果」——此处更糟，连点击都不需要，读自己的提示即可
- 「无法解释任务为何推进、退回或停止」

### 修复（采用方案 A）

**A｜排除区由单矩形改为矩形表，纳入本窗口。** 已实现在 `useContinuousVision.ts`：

```ts
const observationExclusions = new Map<string, ObservationRect>();   // owner → 矩形

export function setObservationExclusion(owner: string, rect: ObservationRect | null): void
export function resolveExclusionRects(frameW, frameH, screenW, screenH): FrameRect[]
```

- 两个 owner：`'pet'`（边界经 BroadcastChannel 广播）与 `'self'`（本窗口）
- `'self'` 的位置**在抓帧时刷新**——浏览器没有窗口 move 事件，
  靠刷新保证窗口移动后不漏遮，不需要轮询或主进程配合
- 本窗口位置直接读 `window.screenX/screenY/outerWidth/outerHeight`，
  **不需要改 `desktop/main.ts`**（比原估方案更省）
- `captureVideoFrame` 遍历矩形表逐个用背景色抹掉
- 未采集到窗口尺寸时不登记，避免误抹整帧

**为什么这能根治**（仅当排除区真的覆盖到面板所在窗口时）：模型读不到我们的面板，
也就读不到面板上那句被引用的证据字面量。方案 B 只是不去引用字面量，
但面板仍可入镜，其它文字仍可能泄漏。

### ⚠️ 更正（2026-09-18 21:20）：本修复**没有**覆盖用户实际配置下的面板

上一段写成「涵盖主窗口/面板」，这是**错的**。查证 `client/src/main.tsx`：

```tsx
surface === 'desktop-pet' ? <DesktopPetOverlay /> : <ButlerWorkspace />
```

只有两个分支——`App.tsx` **根本不会被渲染**（死代码）。由此推出实际拓扑：

| 角色 | 窗口 | 说明 |
|---|---|---|
| 观察者（跑 `useContinuousVision`） | 管家窗口 `?surface=butler` | `--pet` 启动下 `show:false`，**隐藏** |
| 面板显示（用户看到的卡片） | 桌宠窗口 `?surface=desktop-pet` | 可见，常驻最上层 |

所以 `'self'` 遮的是**隐藏的管家窗口**——对用户实际看到的面板毫无作用。
真正需要遮的是桌宠窗口，而它依赖 `petWindow.getBounds()` → IPC → BroadcastChannel
这条链。**该链路本次未能验证是否生效。**

同时确认捕获范围：`desktop/main.ts:576` 的 `setDisplayMediaRequestHandler`
直接取 `desktopCapturer.getSources({types:['screen']})[0]`，即
**整个主屏**、无选择器。因此桌宠窗口**必然在观察画面内**。

### 实验：遮罩能否真的挡住（结论：不确定）

用用户 21:13 的截图做对照，按 `captureVideoFrame` 的算法（采样矩形上方颜色填充）
生成遮罩版，两版都送真实 Ollama：

| 版本 | 是否读到自有 UI 文案 |
|---|---|
| 原图（不遮罩） | **没读到** |
| 遮罩后 | **没读到** |

**这次没有复现泄漏。** 而 20:21 那一帧模型确实读到了 `Blink 编译已完成`。
说明泄漏是**间歇性**的（取决于模型当次的注意力），单次对照无法证明修复有效。
`当鼠标移至` 经全仓检索确认**不存在于本仓库任何代码**，属模型臆造，不作为依据。

→ 结论：遮罩机制在逻辑上正确，但**缺少可观测的验证手段**，
且覆盖范围存在上述缺口。需要补一个能被观察到的诊断，否则无法判断它是否生效。

**已知代价**：面板最大化盖住整屏时，观察帧会近乎纯色，被既有的纯色帧检查
（`MIN_FRAME_LUMA_STD`）挡下 → 观察静默停止。这是刻意的取舍：
**宁可停止观察，也不能让系统读到自己的界面。** 但「静默」不理想，
暂记为后续改进点（应在面板上给出「自有窗口遮挡了观察区域」的提示）。

新增 10 项测试（`useContinuousVision.test.ts`）：矩形表增删改、退化矩形不入表、
坐标映射与越界、**桌宠与本窗口都被抹掉**、窗口移动后按新位置抹、读不到尺寸时不误抹。

### D（已实现，2026-09-18 21:38）：让「遮罩有没有生效」可被观察

**为什么先做 D**：遮罩机制在逻辑上正确，但出问题时看不见——本次就卡在这里，
只能靠推理而拿不到证据。没有观测出口，下面几个方案都无法验收。

**关键约束：诊断只能落盘，绝不上屏。**
诊断文案若渲染到屏幕上，它自己就成了一段可被视觉观察读回的文本，
正好踩中本模块要防的那个坑。所以走「渲染进程 → IPC → 主进程 dlog」这条路，
日志落在既有的 `desktop.log`。

实现（4 处）：

| 文件 | 改动 |
|---|---|
| `client/src/modules/vision/useContinuousVision.ts` | 新增 `describeExclusions()` 与 `setExclusionReporter()`；`resolveExclusionRects` 改为委托前者 |
| `client/src/ButlerWorkspace.tsx` | 接上 reporter，把报告发往主进程 |
| `desktop/butlerPreload.cts` | 暴露 `logDiagnostic(tag, payload)` |
| `desktop/main.ts` | `ipcMain.on('diag:log')` → `dlog`（tag/payload 各截断长度） |

报告内容：

```json
{ "screenWidth": 1919, "screenHeight": 1079,
  "frameWidth": 1280, "frameHeight": 720,
  "registered": ["pet", "self"],
  "masked":     [{"rx":800,"ry":400,"rw":293,"rh":267}],
  "skipped":    [] }
```

- `registered` 回答**最关键的问题**：桌宠窗口到底有没有被登记进来
- `masked` 是实际抹掉的矩形；`skipped` 是登记了却没遮到的（画外/尺寸退化）——
  **故障态在这里会显形，不再静默**
- 只在排除区**变化时**上报一次，重复抓帧不刷屏

**新增 5 项测试**：报告内容正确、一个都没遮住时如实报告不静默、
变化时上报一次且不刷屏、重新接线后第一帧就上报、
**上报内容不含任何可被当成证据的字面量**（用正则断言无中文与 IDE 证据词）。

### D 的第一次读数（2026-09-18 21:52，用户重启后）

```
[diag:exclusion] {"screenWidth":1920,"screenHeight":1080,"frameWidth":1280,"frameHeight":720,
 "registered":["pet","self"],
 "masked":[{"rx":945,"ry":426,"rw":307,"rh":279},{"rx":353,"ry":104,"rw":573,"rh":480}],
 "skipped":[]}
```

**两个结论：**

1. **桌宠窗口的边界广播是通的**（`registered` 含 `"pet"`）——此前怀疑的
   IPC → BroadcastChannel 链路被排除。遮罩机制一直在工作。
2. **但发现了 D 自己暴露出的回归**（见下）。

反算屏幕坐标：

| 矩形 | 屏幕坐标 | 尺寸 | 实际是谁 |
|---|---|---|---|
| 1 | x∈[1417,1878], y∈[639,1058] | 460×418 | 桌宠窗口 ✓ |
| 2 | x∈[529,1389], y∈[156,876] | **860×720** | **管家窗口——但它此时是隐藏的** |

### 回归：隐藏的观察者窗口被当成可见窗口遮掉（已修）

`--pet` 启动下管家窗口 `show:false`，但渲染进程**照样能读到它的
`outerWidth/outerHeight`（860×720）和 `screenX/screenY`**。修复 A 把这当成
「本窗口」登记进排除区，于是白遮掉 860×720 / (1920×1080) ≈ **30% 的屏幕面积**——
反而放大了用户抱怨的「遮挡导致没识别」。

**为什么不能靠 `document.visibilityState`**：管家窗口设了
`backgroundThrottling:false`，Electron 文档明确这个开关**同时让 Page Visibility API 失效**
（隐藏时仍报 visible）。所以必须由主进程明确告知。

修复（5 处）：

| 文件 | 改动 |
|---|---|
| `desktop/main.ts` | 新增 `syncButlerVisibility()`，挂在 `show`/`hide`/`minimize`/`restore`/`did-finish-load`；新增 `ipcMain.handle('butler:self-visible')` |
| `desktop/butlerPreload.cts` | 暴露 `getSelfVisible()`（invoke 取权威初值）与 `onSelfVisible()`（订阅变化） |
| `client/.../useContinuousVision.ts` | 新增 `setSelfWindowVisible()`；`readSelfWindowRect()` 在不可见时返回 null，**不登记也就不遮**；报告增加 `selfVisible` 字段 |
| `client/ButlerWorkspace.tsx` | 挂载时 `getSelfVisible()` 取初值 + `onSelfVisible` 订阅 |
| `client/components/ButlerPetPanel.tsx` | 扩展 `arrodesButler` 全局类型 |

用 invoke 取初值是为了避开竞态：`did-finish-load` 的那次广播可能早于
渲染进程注册监听。

**默认值取 `true`（保守）**：万一可见性信号没送达，宁可多遮一处，
也不让系统读到自家面板——这是本模块的第一原则。

新增 4 项测试：不可见时不登记 self、可见时仍排除 self、
可见性变化立刻反映到下一帧、可见时不影响桌宠排除。

### 修复后的读数（2026-09-18 22:17，通过）

用户再重启一次后，日志给了两条读数，正好把「注册前 → 注册后」都记下来：

```
14:16:46  {"registered":[],      "selfVisible":false, "masked":[],                            "skipped":[]}
14:17:00  {"registered":["pet"], "selfVisible":false, "masked":[{"rx":959,"ry":409,"rw":307,"rh":279}], "skipped":[]}
```

**修复生效，三项都符合预期：**

| 字段 | 读数 | 含义 |
|---|---|---|
| `selfVisible` | `false` | 管家窗口正确报告自己隐藏，主进程的可见性信号送达 |
| `registered` | `["pet"]` | 只剩桌宠，隐藏窗口不再挤占排除区 |
| `masked` | 1 个矩形 | 不再白遮一整块 |

量化：

| | 遮罩面积 / 帧 | 占比 |
|---|---|---|
| 修复前 | 307×279 + 573×480 = 360,693 | **39.1%** |
| 修复后 | 307×279 = 85,653 | **9.3%** |
| 差额 | | **少遮 29.8 个百分点** |

反算桌宠矩形的屏幕坐标 `x∈[1438,1899] y∈[614,1032]`，
与用户截图里面板的可见范围（约 `x∈[1648,1791] y∈[613,838]`）比对：
**面板完整落在遮罩区内** → 自我确认的原料（面板上那句
「等待证据：Done uploading.」）已被切断。

`solo` 说明：14:16:46 那条 `registered:[]` 是启动后、桌宠边界尚未广播出去的
过渡态。真实使用时观察是由用户手动开启的，届时边界早已注册完毕，不构成风险。

### 用户提问：「为什么现在显示 Arduino 内容，但我在 WorkBuddy」（22:34）

面板停在旧内容上。**机制上这是设计使然**：面板持有的是「最后一次观察」，
没有任何东西会清空它——`observation` 与 `taskSession` 只在**新观察到达时**更新。

于是有两种完全不同的原因，但**在界面上长得一模一样**：

| 原因 | 现象 |
|---|---|
| **循环根本没在跑**（未开启／已停止／屏幕共享结束） | 面板保留上一次结果，无任何提示 |
| **循环在跑但静默停摆** | 同样保留上一次结果，仍显示「观察中」 |

第 2 种是**真实缺陷**，本次查证确认存在（见下）。

#### 缺陷：推理请求没有超时 → 观察循环会永久静默停摆

```ts
const response = await fetch('/api/v1/vision/analyze-base64', { ... });   // 无 timeout、无 AbortSignal
```

配合采样器的闩锁：

```ts
if (isSpeaking || this.inFlight) return null;    // inFlight 一旦卡住就永远是 true
this.inFlight = true;
try { return await this.analyze(...); } finally { this.inFlight = false; }
```

`finally` 只在 `analyze()` **真正 settle** 时才执行。推理请求一旦挂住不返回，
`inFlight` 永久为 true → `sample()` 永远返回 null → **循环还在跳，但再也不会分析**，
既不报错也不更新，面板显示「观察中」却永远是旧内容。

对照：`useVisionStatus` **有** 8 秒超时，同一个代码库里已经知道该怎么做，这个调用点漏了。

**修复**（TDD）：

- `continuousVision.ts` 新增 `fetchWithTimeout()`：超时后 abort 并抛出可读原因；
  只把"我们自己中断的"改写成超时，503/网络错误原样抛出，避免真因被盖掉
- `analyzeScreen` 接上 `VISION_REQUEST_TIMEOUT_MS = 120_000`
  （冷启动约 15 秒、热态 2~4 秒，给足余量；它的作用是**恢复**而非控制时延）
- 新增 3 项测试：正常透传且不留悬挂定时器、挂起时按超时中断、非超时错误不被改写

#### 诊断：让「循环在不在跑」可被观察

新增 `SampleOutcome`（`analyzed` / `skipped-speaking` / `skipped-inflight` /
`skipped-unchanged` / `failed`）与采样器 `onOutcome` 回调；循环侧再补一个 `no-frame`。
经 `setVisionTickReporter()` → `logDiagnostic('vision-tick', ...)` 落盘。

日志策略：`analyzed` / `failed` 每次都报，其余跳过态只在**状态切换**时报一次——
否则每 10 秒一条 skip 会把日志刷满。新增 2 项测试覆盖上报与失败后重试。

有了它，「面板为什么是旧内容」以后可以直接从日志回答：
没有任何 `[diag:vision-tick]` = 循环没跑；`skipped-unchanged` 长期不变 = 画面真的没变；
反复 `failed` = 推理在出错；`skipped-inflight` 持续出现 = 还有请求没 settle。

### 已修：新鲜度表达 + 观察期间让位（2026-09-18 22:54，两者一起做）

用户决定「一起吧」。两件事同族：**都是让界面如实表达"我现在是什么状态"**。

#### 一、新鲜度：面板必须说清内容是什么时候的

`desktopPetState.ts` 新增 `DesktopPetFreshness`：

```ts
{ level: 'live' | 'recent' | 'stale' | 'stopped'; label: string }
```

判定规则（`now` 作为参数注入，便于测试）：

| 条件 | level | label |
|---|---|---|
| 观察已停止 | `stopped` | `观察已停止 · 上次 N 分钟前` |
| 停止且从未观察到 | `stopped` | `观察已停止`（不编造时间） |
| 观察中，< 60 秒 | `live` | `刚刚` |
| 观察中，< 5 分钟 | `recent` | `N 分钟前` |
| 观察中，≥ 5 分钟 | `stale` | `N 分钟前·可能已过期` |
| 观察中但时间戳缺失/不可解析 | `live` | `等待画面`（不假装新鲜） |

界面侧：
- meta 行新增新鲜度药丸，紧挨状态（`margin-right: auto`，不被 `space-between` 推到中间）
- `stale` 琥珀、`stopped` 灰
- 正文（标题/状态/下一步）在 `stale`/`stopped` 时降为 0.6 不透明度——
  **刻意只降权不隐藏**，用户仍要能读到上次结论是什么
- **30 秒 tick**：不做的话「3 分钟前」会永远停在 3 分钟前，等于没有新鲜度

新增 8 项测试覆盖全部分支（含时间戳不可解析的降级）。

#### 二、C：观察期间让位 —— **已实现又已撤回（用户否决，2026-09-18 23:52）**

**用户原话**：「每次桌宠我都有调整，不要让他变大变小的」

**为什么撤**：这是我判断失误。用户每次都会自己调整桌宠的窗口大小，
系统在观察开始/结束、悬停/离开时自动缩放，等于**反复覆盖用户的手动设定**。
技术上可行（见下）不代表该做——这个功能的价值，抵不过它夺走用户对自己桌面的控制权。

已撤回的全部内容（`git diff` 确认桌宠组件净改动只剩新鲜度）：

| 撤回项 | 说明 |
|---|---|
| `petInteraction.ts` | `PET_COMPACT_WIDTH`、`resolvePetWindowWidth` 及其 5 项测试 |
| `desktop/main.ts` | `pet:resize-anchored` 处理器 |
| `desktop/petPreload.cts` | `resizeAnchored(w, h)` |
| `DesktopPetOverlay.tsx` | `hovering` 状态、收起/展开 effect、收起时不弹卡片及其两个 effect、`resizeAnchored` 调用 |

保留的技术结论（将来若真需要，不必重新摸索）：

- **可行性依据**：`.desktop-pet` 是 `100vw/100vh` + `overflow: hidden`，
  小球容器用百分比 `inset`、`object-position: right bottom`
  → 窗口缩小内容等比缩放且裁在窗口内，**布局是安全的**
- **唯一易错点**：普通 `setSize` 以**左上角**为锚，而桌宠贴在工作区右下角，
  直接缩会把小球推出画面。真要缩，必须同时重算 x/y 固定右下角

**仍未解决**：面板占屏导致的遮挡。用户的处置方式是**自己调整桌宠大小/位置**，
这是他的选择，不再由系统代劳。

#### 保留的取舍说明（新鲜度）

- **30 秒 tick 不可省**：不做的话「3 分钟前」会永远停在 3 分钟前，等于没有新鲜度
- **只降权不隐藏正文**：用户仍要能读到上次结论是什么
- **时间戳不可解析时标「等待画面」**：不假装新鲜，也不编造时间

### 阶段性结论

- **桌宠边界广播正常**（22:17 那条证明），方案 A′ 无需实施
- **遮罩精确覆盖面板**，自我确认路径已闭合
- **用户感知的「遮挡没识别」是产品问题**：面板物理占着屏幕约 460×418，
  遮罩把它变盲区——但盲区本来就是被面板挡住看不见的地方。
  换句话说，遮罩没有新增损失，但也没有解决遮挡本身。→ 该走方案 C

### 判读方式（留作后续复验）

| 日志现象 | 结论 |
|---|---|
| `registered` 含 `"pet"` 且 `masked` 非空 | 遮罩生效 ✓ |
| `registered` 只有 `"self"`，没有 `"pet"` | 桌宠边界广播没送达 |
| `selfVisible: true` 但 `--pet` 启动 | 可见性信号有问题（应为 false） |
| `skipped` 非空 | 有窗口登记了却没遮到（画外/坐标退化） |
| 完全没有 `[diag:exclusion]` 行 | reporter 没接上或抓帧没跑 |

### 仍未决

| 方案 | 做法 | 评价 |
|---|---|---|
| **A′** | 桌宠窗口自己读 `window.screenX/screenY/outerWidth/outerHeight` 并广播，不再依赖 IPC 往返 | 去时序依赖，但仍是几何遮罩，多屏/缩放脆弱 |
| **B′** | 面板不再原样渲染证据字面量 | 唯一不依赖窗口位置的兜底，但用户看不到「在等什么」 |
| **C** | 观察期间桌宠自动淡出/收成极小指示 | 同时解决自我观测**与用户抱怨的遮挡**；代价是观察时看不到状态卡 |

**下一步建议：等 D 的日志出来再决定。** 若日志显示遮罩本来就生效，
那用户感知到的「遮挡」是产品问题 → 走 C；若显示没生效 → 先修 A′。

## 缺陷三：相同证据重复推进（未修，P2）

画面几乎没变、模型仍读到同一份旧编译输出时，`applyTaskObservation`
会重复给出 `advance` + 同一条下一步建议。实测连续三轮相同画面：

```
第 1 轮: advancing / 点击上传按钮 / verify=none
第 2 轮: advancing / 点击上传按钮 / verify=pending
第 3 轮: advancing / 点击上传按钮 / verify=pending
```

（`Sketch uses N bytes` 编译后永久留在输出面板，因此这是稳定可复现的状态。）

`ContinuousVisionSampler` 会跳过未变化的帧，所以触发条件是**画面有局部变化
但证据未变**（输出面板滚动、串口监视器刷新、鼠标移动等）。

严重度评估：`VISION_OBSERVATION` 事件只把描述存进 `visualContextRef`
供下一轮对话使用，**不触发播报**（已查证 `useVoiceChat.ts:88`）。
因此不是语音骚扰，而是面板反复显示同一建议 + 每轮约 12 秒 GPU 空转。

## 验收标准逐条对照（本轮实际结果）

| # | 标准 | 结果 |
|---|---|---|
| 1 | 用户显式开启和停止屏幕共享 | 未验（用户已开启，未走停止流程） |
| 2 | 观察目标可修改并用于下一次分析 | 未验 |
| 3 | 返回并展示完整结构化字段 | **通过**。真实帧返回 5 类字段，`visibleText` 精准 |
| 4 | 坏 JSON 不崩溃、保留原始摘要、标记降级 | 代码层通过（新增标记与测试），真机未触发 |
| 5 | 相同画面不重复分析，失败后可重试 | **部分不通过** → 见缺陷三 |
| 6 | TTS 播报期间暂停视觉分析 | 未验 |
| 7 | 停止共享后不再捕获或分析 | 未验 |
| 8 | 屏幕文字不能改变系统安全规则 | **代码层已修**（缺陷二），待真机复验 |

**结论：本轮验收不通过。** 缺陷二曾使第 8 条实质失败，现已修复但**尚未在真机上复验**——
修复的验证要求是：重现同一场景，确认模型 `visibleText` 里**不再出现**阿罗德斯自己的文案。

## 尚未覆盖

- 步骤 C 的完整形态（制造编译错误看是否 `blocked`）：本轮用户走的是上传失败，
  已单独覆盖并发现缺陷一
- 上传成功后的「上一步验证」转绿（闭环在真机上仍未走通过一次）
- LED 实体闪烁（需硬件，属第二阶段）
- 摄像头链路
- 任务中断后从已验证步骤恢复（`taskSession` 状态只活在会话内，进程重启即丢；
  这是设计取舍，但需专门验收确认「中断即重置」符合预期）

## 复现命令

```bash
cd E:/project/Arrodes/Butler/client
node node_modules/vitest/vitest.mjs run src/modules/vision/   # 53 passed
node node_modules/vitest/vitest.mjs run                        # 29 files / 180 passed
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/vite/bin/vite.js build
```

注意：`npx vitest` 在本环境会被安全策略拦截（触发 `wsl.exe`），
必须用 `node node_modules/vitest/vitest.mjs` 直接调用。
