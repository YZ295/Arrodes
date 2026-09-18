# 屏幕观察最小闭环 · 真机验收（2026-09-18）

> 状态：**部分执行，结论不通过**。已用用户真实屏幕帧完成一次端到端验证，
> 发现的三个缺陷中 1 个已修、2 个待决。

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

## 缺陷二：系统读自己的文字，把自己「确认」成完成了（未修，最严重）

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

### 待决的修复方案

| 方案 | 做法 | 代价 |
|---|---|---|
| **A（推荐）** | 排除区由「单个矩形」改为「矩形列表」，同时纳入桌宠窗口与主窗口/面板；主进程一并上报面板 bounds | 需改 `desktop/main.ts` 的 bounds 上报；被排除的屏幕面积变大 |
| **B** | 面板不再把期望证据字面量嵌进句子，改为独立标签行（如「等待证据：…」） | 只降低概率，不根治；用户仍需知道在等什么 |
| **A + B** | 两者都做，对「未来某个未排除的浮层」留纵深防御 | 改动面最大 |

**A 是唯一根治手段**，B 只能降低复发概率。建议 A 为主、B 作纵深防御。

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
| 8 | 屏幕文字不能改变系统安全规则 | **不通过** → 见缺陷二 |

**结论：本轮验收不通过。** 缺陷二使第 8 条实质失败。

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
node node_modules/vitest/vitest.mjs run src/modules/vision/   # 43 passed
node node_modules/vitest/vitest.mjs run                        # 170 passed
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/vite/bin/vite.js build
```

注意：`npx vitest` 在本环境会被安全策略拦截（触发 `wsl.exe`），
必须用 `node node_modules/vitest/vitest.mjs` 直接调用。
