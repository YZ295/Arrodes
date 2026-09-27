# 交接：把「宇宙眼」形象嫁接进 Butler 桌宠

> 交接方：阿棠（WorkBuddy）　接手方：Codex　日期：2026-09-27
> 本文档是**唯一权威说明**。设计意图见同目录 `index.html`，可跑源码见 `../particle-eyes/tuner.html`。

---

## 0. 一句话任务

`prototype/particle-eyes/tuner.html` 里已经验证过的「宇宙眼」WebGL 形象，
接进 `Butler/client/src/desktop-pet/`，替换或并存于现有的 `ParticleAura`。

**动手前有三个问题必须先拿到用户答复**（见 §6），否则会返工。

---

## 1. 仓库与分支的真实状态

> ⚠️ 常见误解：`Agent/` 与 `Butler/` **不是两个分支**，是同一分支下的两个顶层目录。
> 真正的分支隔离发生在 worktree 层面。

### 主干

| 项 | 值 |
|---|---|
| 主 worktree | `E:/project/Arrodes` |
| 当前分支 | `feature/desktop-pet-vision` |
| HEAD | `d91dd36a725c720704ea9d200e967f16e7b4aefc` |
| 上游 | **无**（`feature/desktop-pet-vision` 没有 remote tracking） |
| remote | `origin` → `https://github.com/YZ295/Arrodes.git` |

`Agent/` 与 `Butler/` 都在 HEAD 里，同属这一分支。

### 其他 worktree（`git worktree list`）

```
E:/project/Arrodes                                          d91dd36  [feature/desktop-pet-vision]
E:/project/Arrodes-plugin                                   7a8c8ae  [plugin/dsh-mcp]
C:/Users/29352/AppData/Local/com.crow5.desktop/crow5/
  worktree/07bafb91ac8105467f1bd7313f1b5ab7b89a9c5b/jolly-sailor  a350bd6  [opencode/jolly-sailor]
```

### 本地分支（节选）

- `feature/desktop-pet-vision` ← **当前**，`d91dd36`
- `dev/continue` → 同指 `d91dd36`（与当前分支同步）
- `main` → `8e62a10`，ahead origin/main 3
- `develop` / `master` → `856425d` / `7d3dfb2`
- `fix/fix3` → `a350bd6`（origin 的 HEAD 指向它）
- 一批 `rescue-*` 保护分支（见 §2）

### 远程分支

```
origin/HEAD -> origin/fix/fix3
origin/main  origin/fix/fix3  origin/feature/desktop-shell  origin/feature/session-persistence
```

---

## 2. ⚠️ 本仓库的 git 陷阱（必读，动手前先看）

**`git commit` / `git reset --hard` / `git update-ref` 会报告成功，但 ref 不移动。**

- 提交后**必须** `git rev-parse HEAD` 验证
- **reflog 显示新提交是假象**，不能作为证据
- 绕过方式（`mkdir` 必须与 `printf` 在同一条命令里）：
  ```bash
  mkdir -p .git/refs/heads/<dir> && printf '%s\n' "<hash>" > .git/refs/heads/<branch>
  ```
- 任何破坏性操作之前，先 `git branch rescue-<hash> <hash>` 保护
- 仓库里那批 `rescue-*` 分支就是这么来的，**不要清理它们**

另：若 shell 报 `Access is denied`，是环境问题，先换一个 shell 工具再下结论。

---

## 3. 工作区现状（75 个未提交改动）

Codex 进来会直接撞上 75 个改动。**它们分两类，性质完全不同：**

### A. 与本任务无关的既有成果（约 74 项）

Butler 侧的学习教练域、视觉链路、桌宠改造，以及大量 `spec/verification/*.md`。
**不是这次形象工作产生的，不要回滚、不要顺手提交。** 例如：

- `Butler/server/src/services/learningCoachService.ts` 等一批 `??` 新文件
- `Butler/client/src/desktop-pet/*.ts(x)` 的 ` M` 修改
- `Plan/backlog.md`、`Plan/tickets.md`、`spec/status.md`
- `research/ashley-desktop-assistant-deep-study-2026-09-26.md`

### B. 本次形象工作的产出（`?? prototype/`，未追踪）

```
prototype/particle-eyes/tuner.html        捏脸台（可跑的完整形象着色器）
prototype/particle-eyes/shoot-face.cjs    无头出图 + 分层消融度量
prototype/particle-eyes/check-board.cjs   设计稿页面自检
prototype/particle-eyes/shots/            出图与报告
prototype/arrodes-face/index.html         形象设计稿 v1
prototype/arrodes-face/img/               定妆图 5 张
```

⚠️ **`prototype/` 完全未追踪**：`git checkout` / `reset --hard` 不会动它，
但 **`git clean -fd` 会直接删掉**。别在仓库根跑 `git clean`。

### 建议的隔离动作（动手前）

```bash
# 1. 先保护当前 HEAD
git branch rescue-d91dd36 d91dd36

# 2. 把本次形象产出单独落一个提交，别和既有的 74 项混在一起
git add prototype/ && git commit -m "feat(prototype): 宇宙眼形象原型与设计稿"
git rev-parse HEAD          # 必须验证 ref 真的动了（见 §2）

# 3. 既有 74 项改动保持原样，交给用户决定怎么处理
```

---

## 4. 嫁接目标（Butler 侧接口）

### 要替换/共存的现有实现

| 文件 | 说明 |
|---|---|
| `Butler/client/src/desktop-pet/ParticleAura.ts` | **主目标**。自研 WebGL1 粒子光环，1200 点，单 shader |
| `Butler/client/src/desktop-pet/auraDance.ts` | `selectAuraDance(input)` + `computeAuraFrame(dance, now)` 纯函数，产出 intensity / speed / ringPhase / color |
| `Butler/client/src/desktop-pet/DesktopPetOverlay.tsx` | 宿主组件，挂 canvas、驱动状态 |
| `Butler/client/src/desktop-pet/desktopPetState.ts` | `createDesktopPetViewModel(snapshot)` → `view.tone` 等 |

### `ParticleAura` 的现有契约（保持兼容）

```ts
export interface AuraController {
  setState(input: AuraInput): void;   // AuraInput = { voice, observing }
  destroy(): void;
}
export function mountAura(canvas: HTMLCanvasElement): AuraController;
```

### `DesktopPetOverlay` 里已存在的形态开关

```ts
const PET_VISUAL = import.meta.env.VITE_PET_VISUAL || 'vrm';
// 'vrm' | 'procedural' | 'live2d' | 'png'
const [avatar, setAvatar] = useState<'ball' | 'vrm' | 'image'>(...)
```

→ 新增一种形态时**沿用同一套开关模式**，不要另造第二套。

### ⚠️ `ParticleAura` 里必须原样保留的工程纪律

这些是硬要求，改造时不要丢：

- 30 fps 封顶（`FRAME_MS = 1000 / 30`）
- `document.hidden` 时暂停；`visibilitychange` 回前台重建 rAF 循环
- `prefers-reduced-motion: reduce` → 不启动，优雅降级
- 无 WebGL 环境 → no-op，**不抛错**
- DPR 上限 1.5
- `destroy()` 里 `WEBGL_lose_context().loseContext()`、移除事件监听

---

## 5. 源：形象着色器在哪、怎么搬

### 位置

全部在 `prototype/particle-eyes/tuner.html` 一个文件里（自包含，无依赖）。

### 要搬的部分

| 标识 | 内容 |
|---|---|
| `SOLID_VERT` / `SOLID_FRAG` | **实体眼层**：全屏 quad + 片元着色器，算出眼型/虹膜/瞳孔/角膜缘/螺旋/星云/睫毛/发光 |
| `VERT_SRC` / `FRAG_SRC` | **粒子层**：背景星尘 + 角色分类（0 虚空 / 1 眼睑 / 2 虹膜 / 3 瞳孔 / 4 光晕 / 5 高光 / 6 虹膜内辉） |
| `DEFAULTS` | 几何 + 全部外观参数 |
| `LOOK_BASE` / `LOOK_OBS` | 常态 / 观察态两套配色（**观察态配色是从参考图采样标定的**，勿凭手感改）。其中 `voidA` / `voidB` 是背景星云色，**必须是加亮型**，见 §7.9 |
| `PRESETS['诸神']` | 「定妆」参数集，一键回到设计稿状态 |
| `US` + `MISSING_U` 审计 | uniform 名表 + 缺失检测（见下） |

### `MISSING_U` 审计（建议一并搬）

`gl.getUniformLocation` 在名字不匹配时返回 `null`，而**已声明未赋值的 uniform 默认为 0**。
后果是乘法式的层会整层静默消失（乘 0）。所以启动时必须审计一遍，有缺失就 console.warn。

### 性能

`SOLID_FRAG` 每像素约 5 次 3 倍频 fbm + 30 余次胶囊距离场，
软渲染（SwiftShader）下实测约 **21 fps**。真机 GPU 无压力，
但**接入后必须在前端实测一次真实帧率**，不达标时优先降 fbm 倍频数。

---

## 6. 用户已拍板的方向（2026-09-27）

| 决策 | 结论 |
|---|---|
| EmotionBall | **替换**。桌宠形象改由实体眼着色器接管 |
| 全屏背景窗 | **加**。星云铺满桌面 |
| 尺寸与位置 | 沿用默认（偏小、居中）。全屏窗只是背景，眼睛不该占满屏幕抢注意力 |

### 由此产生三条硬约束

1. **全屏窗必须点击穿透。**
   Electron 侧 `win.setIgnoreMouseEvents(true, { forward: true })`，否则整个桌面点不动。
   注意 `{ forward: true }` 不能省，否则穿透的窗口收不到 `mousemove`，悬停态失效。

2. **眼睛留在 660×600 的桌宠窗，不要搬进全屏窗。**
   两者职责不同：桌宠窗是交互面（悬停/点击/聊天），全屏窗是纯装饰。
   合并会让一个只该「看」的东西去接管输入，窗口层级与失败模式也会纠缠在一起。
   → 全屏窗只挂背景层，不挂眼睛。

3. **全屏窗必须提供强度开关。**
   再好的自适应也挡不住用户想「安静一会儿」。

---

## 7. ⚠️ 移植时最容易踩的九个坑（都已付出血的代价）

> 详细推理见 `.workbuddy/memory/2026-09-26.md` 与技能 `webgl-proto-verify`（手法十、十一、十二）。

### 7.1 分层合成：裁剪权只属于一个变量

眼型裁剪来自 `inEye`。虹膜层的 alpha 若写成 `A = max(A, irisMask)` 而**漏掉 `inEye`**，
虹膜就不再被眼型裁剪，直接画成一个完整圆盘叠上去 ——
**症状极阴：画面"看着挺正常"，只是不像眼睛了。** 每一层都要显式乘裁剪项。

```glsl
float irisA = inEye * irisMask;   // 必须
```

### 7.2 几何不合格时，所有纹理参数调都是无效功

虹膜半径 ≥ 眼裂高度时，螺旋/纹理完全没有落脚空间。
此时调纹理强度，实测 Δ 只有 **0.01**（等于噪声）；几何改对后立刻跳到 **1.04**。
**先验几何，再调纹理。**

当前合格参数：`lidH 0.70` / `lowerK 0.64` / `irisR 0.420`。

### 7.3 三角函数的相位行程必须 ≥ 2π

螺旋 `sin(a*dens + r*turn)`：单格里 `r` 只走到 0.64，`turn = 9` 时相位仅 5.8 rad ≈ **0.92 圈**。
不满一圈的「螺旋」看起来是个**逗号**。→ `turn ≥ 20`。

### 7.4 幂次线宽的判据在"中位数处"

`pow(w, k)`：w 中位数 0.5 时，`pow(0.5, 1.55) = 0.34` —— 半个格子都带 alpha，
整块区域糊成一层灰纱。→ `k ≥ 3`。判据是先算 `pow(0.5, k)`，别凭感觉。

### 7.5 随机化必须多维

只随机「每格的旋转」，形状仍完全一致 → 拼出一整张**规则墙纸**。
必须同时随机**缩放 + 圈数**，并先做一次低频 **domain warp** 把网格本身揉歪。

### 7.6 方向参数的递增/递减决定"扇形"还是"交叉成绺"

睫毛的 `rot` 随「从内眼角到外眼角」的进度：
`rot = 0.74 + 0.58*uc`（递增）→ 内眼角朝外、外眼角朝上 → **全部交叉挤成一绺**。
必须**递减**：`rot = 1.32 - 0.66*uc`（内朝上、外朝外）。

另：单段胶囊 = **金属直棍**。毛发/弧线类要按贝塞尔采样**切 3 段、半径逐段递减**（0.78 → 0.46 → 0.18）。

### 7.7 乘法式自发光的位置

`col *= 1.0 + emis * state` 放在哪一行决定成败：

- 放在**底色之后、细节（星云/星团/纤维）之前** → 细节保留 ✅
- 放在**细节之后** → 细节被一起放大到饱和，虹膜退化成一块平的亮盘 ❌

口诀：**乘在底色上，加在细节后。**

### 7.8 窄窗口缩放不能只按宽高比

```js
// ❌ 在 aspect = 1.1（桌宠 660×600）时恒等于 1，等于完全没收
eyeScaleFit = CFG.eyeScale * Math.min(1, aspect / 0.92);

// ✅ 按眼对横跨宽度收
const spanNdc = CFG.eyeScale * (CFG.eyeSep + 1) / aspect;
eyeScaleFit = CFG.eyeScale * Math.min(1, 0.86 / Math.max(spanNdc, 1e-3));
```

### 7.9 全屏背景层必须是「加亮型」配色

星云要铺在用户桌面上，而桌面可能是 Word 的白底。**同一套配色必须在亮底与暗底两端都成立。**

实测三档模拟桌面（1920×1080，叠加前后全帧平均亮度）：

| 桌面底 | 无叠加 | 有叠加 | 变化 |
|---|---|---|---|
| 浅色（白底文档） | 189.2 | 182.2 | −7.0 |
| 中灰（深色 IDE） | 38.7 | 43.4 | +4.7 |
| 近黑（参考图那种） | 12.9 | 19.6 | +6.7 |

**第一版用了压暗型配色**（`voidA #211a4c / voidB #6b61c7`），
结果浅色桌面上星点变成**一层「黑芝麻」**，整片被压暗 8.9。
改成加亮型（`voidA #574798 / voidB #b8a8ff`）后，暗点完全消失。

⚠️ **这不是「加色混合」能解决的。** Electron 透明窗最终仍按 source-over 合成 ——
`blendFunc(ONE, ONE)` 只影响 canvas 内部累加，浏览器把 canvas 贴到桌面上时还是 over。
暗色像素一定会压暗桌面。

**唯一可靠的解法是让颜色本身朝亮的方向走**：
桌面亮 → 淡到近乎隐形；桌面暗 → 整片亮起来。一套配色自动适配两端。

剩余那 −7.0 来自眼睛本体（瞳孔与虹膜外圈必须是不透明的暗部），
是「不透明眼睛覆盖在桌面上」的固有代价，不是背景层造成的。

---

## 8. 验证方法（复用现成脚本）

```bash
cd prototype/particle-eyes
NODE_PATH="C:/Users/29352/.workbuddy/binaries/node/workspace/node_modules" \
  "C:/Users/29352/.workbuddy/binaries/node/versions/22.22.2-3/node.exe" shoot-face.cjs
```

无头 Chrome + SwiftShader，产出：

- `shots/face-stars.png` / `face-observe.png` / `face-void.png` / `face-macro.png` / `face-pet660.png`
- `shots/face-report.txt` —— 分层消融数据

**度量口径必须遵守**：只取**左眼方框**（494×494），不能取全帧。
全帧 1500×860 里眼睛只占 3%，关掉睫毛只掉 0.2，会把「完全没生效」误判成「生效了但很淡」。

设计稿页面自检：

```bash
node check-board.cjs      # 检查图片是否都加载 + 无 pageerror
```

三档桌面叠加实测（全屏背景模式改配色后必须重跑）：

```bash
node check-bg-overlay.cjs  # 1920×1080，浅/中/深三档桌面，输出叠加前后亮度差
```

**判读口径**：浅色底那行若出现明显负值（> −10）或肉眼可见暗点，说明背景层色调回到压暗型了。

---

## 9. 验收标准

- [ ] 零 shader 编译错误，`MISSING_U` 审计为空
- [ ] 前端实测帧率达标（真机 GPU，目标 ≥ 30fps）
- [ ] `prefers-reduced-motion` / 无 WebGL / `document.hidden` 三条降级路径仍然有效
- [ ] 现有 `desktop-pet` 测试全绿（`ParticleAura.test.ts`、`auraDance.test.ts`、`DesktopPetOverlay.test.tsx` 等）
- [ ] 660×600 窗口下形象完整不溢出、不切边
- [ ] 三个状态（星瞳 / 观察 / 虚空）都能被状态机驱动

---

## 10. 参考

| 用途 | 路径 |
|---|---|
| 设计意图与分层说明 | `prototype/arrodes-face/index.html` |
| 可跑的完整源码 | `prototype/particle-eyes/tuner.html` |
| 出图与消融脚本 | `prototype/particle-eyes/shoot-face.cjs` |
| 踩坑全记录 | `.workbuddy/memory/2026-09-26.md` |
| 通用 WebGL 原型验证手法 | `~/.workbuddy/skills/webgl-proto-verify/SKILL.md`（手法十/十一/十二） |
