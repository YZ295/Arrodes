# Now15_TheFool深度学习.md

> 深度学习 GitHub 仓库 `YZ295/TheFoolworkspace`（远端 404/不可达），转本地 `TheFool/` 目录源码

---

## 1. 远端仓库核查

| 项 | 结果 |
|---|---|
| `https://github.com/YZ295/TheFoolworkspace` | **404**（GitHub 页面确认） |
| `api.github.com/repos/YZ295/TheFoolworkspace` | gh-proxy 转 403 rate-limit（无法拿到内容） |
| `api.github.com/users/YZ295/repos` | gh-proxy 转 403（拿不到公开仓库列表） |
| gh-proxy.com 镜像 clone | `Authentication failed`（疑似私有触发认证） |
| 本地 `E:/project/Crow5/Arrodes/TheFool/` | **完整可读**——`desktop_pet.py` 374 行 + `index.html` 333 行 + 构建产物 |

**结论**：远端仓库不存在或私有。深度学习对象实际就是本地 TheFool 目录（作为 Arrodes 仓库 `feature/workspace` 分支 v5.2 提交 `68ad7ce` 加入）。建议用户确认是否需要新建/推送独立仓库。

---

## 2. 项目定位

The Fool —— 塔罗牌「愚者」主题的**双产物轻量艺术包**：

| 产物 | 技术栈 | 输出 |
|---|---|---|
| **桌面宠物「愚者」** | Python 3.14 + PySide6 + PyInstaller | 单文件 `桌宠-愚者.exe`（50 MB，含角色 PNG） |
| **Web 3D 粒子艺术** | Three.js 0.160 + 自定义 GLSL Shader | 浏览器内 `the-fool.png` 粒子化展示 |

**艺术源**：`character_no_bg.png`（857 KB）—— 戴金色冠冕的斗篷神秘人，托举蓝色星球，塔罗意象。与 Arrodes Avatar「THE FOOL 愚者」形象统一（v4.4 记忆）。

---

## 3. 桌面宠物核心实现（`desktop_pet.py`，374 行）

### 3.1 窗口骨架（无边框透明置顶）

```python
self.setWindowFlags(
    Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool
)
self.setAttribute(Qt.WA_TranslucentBackground)   # 真透明
self.setAttribute(Qt.WA_ShowWithoutActivating)    # 不抢焦点
```

要点：
- `Qt.Tool` 而非 `Qt.SplashScreen`：任务栏不出现图标，但持续显示
- `WA_ShowWithoutActivating`：用户点击时焦点不切换（桌宠不能偷走编辑框光标）
- `app.setQuitOnLastWindowClosed(False)`：关闭气泡不退出主程序

### 3.2 资源路径（兼容 PyInstaller 打包）

```python
def resource_path(relative_path):
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), relative_path)
```

经典 `sys._MEIPASS` 模式，运行时开发态与 `onefile` 解包态通吃。

### 3.3 三种动画（手写帧动画，不依赖 QPropertyAnimation）

| 类型 | 总帧数 | 效果 | 数学 |
|---|---|---|---|
| 跳跃 | 25 (50fps) | 二次缓动 + 顶点小抛物线 | `y_offset = -jump_height * (1 - (1-t)²)` |
| 压扁回弹 | 30 | 三段式 (压扁→回弹→恢复) | 三段不同 scale_x/scale_y 配合 translate 居中 |
| 左右抖动 | 30 | 阻尼正弦 | `sin(progress * π * 6) * shake_range` |

**统一接口**：`apply_animation_transform(painter, progress)` 在 `paintEvent` 里根据 `animation_type` 选择分支；`QTimer` 20ms 驱动 `update()` 重绘。

### 3.4 对话气泡（独立子窗口）

`BubbleWidget(QWidget)` 独立窗口 + `Qt.WindowStaysOnTopHint`，定位在角色头部上方 `0.15*w, y-70`。
- 自动测量文字宽度：`metrics.horizontalAdvance(text)` → `setFixedSize(...)`
- 绘制：圆角矩形 `drawRoundedRect(rect, 12, 12)` + 多边形小尾巴 + 居中文字
- `QTimer.singleShot(2500)` 自动隐藏

### 3.5 交互（点击 / 拖拽 / 滚轮 / 右键）

```python
# 点击判定（移动距离阈值 5px）
move_distance = (event.globalPosition().toPoint() - self.press_pos).manhattanLength()
if move_distance < 5:
    self.on_click()

# 滚轮缩放（带下限）
new_scale = min(self.scale + 0.03, 1.0)
new_scale = max(self.scale - 0.03, 0.15)

# 缩放时保持底部位置不变（关键 UX 细节）
new_y = old_pos.y() + old_size.height() - self.height()
self.move(old_pos.x(), new_y)
```

**亮点**：缩放时保持底边锚定，避免宠物"漂浮"感。右键菜单用 `CustomContextMenu` + QSS 圆角美化。

### 3.6 22 条人设台词（DIALOGUES）

涵盖三种语气：
- 日常互动：「摸摸头~」「别戳我啦！」「你在做什么呀？」
- 塔罗人设：「命运的齿轮开始转动~」「未知才有趣~」
- 角色定位：「我是塔罗牌精灵！」「愚者之旅，永不停歇」

---

## 4. Web 3D 粒子艺术（`index.html`，333 行）

### 4.1 流程

```
the-fool.png → <img> onload → Canvas drawImage → getImageData
             → 像素采样 (stride=2, alpha>128) → Points 几何
             → ShaderMaterial 自定义着色 → WebGL 渲染
```

### 4.2 像素采样规则

```javascript
const MAX_DIM = 240;       // 缩放上限，控制总粒子数
const STRIDE = 2;          // 采样步长
const PARTICLE_SIZE = 0.08;
const PLANE_SIZE = 8;
const DEPTH = 2.5;         // 亮度→Z 轴外凸

if (a < 128) continue;     // 透明像素剔除
const brightness = (r + g + b) / 765;
const z = (brightness - 0.5) * DEPTH;  // 亮部前凸，金色高光跳跃
```

每个粒子记录 `{x, y, z, r, g, b, brightness, origX, origY}`。

### 4.3 自定义 Shader（核心视觉效果）

**Vertex Shader**（呼吸与摇摆）：
```glsl
pos.z += sin(uTime * 1.5 + position.x * 2.0 + position.y * 3.0) * 0.15;
pos.x += sin(uTime * 0.5 + position.y) * 0.03;
pos.y += cos(uTime * 0.4 + position.x) * 0.03;
gl_PointSize = size * uPixelRatio * (300.0 / -mvPosition.z);  // 透视缩放
```

**Fragment Shader**（圆形软光粒子）：
```glsl
vec2 coord = gl_PointCoord - vec2(0.5);
float dist = length(coord);
if (dist > 0.5) discard;
float alpha = 1.0 - smoothstep(0.35, 0.5, dist);  // 软边
vec3 lifted = pow(vColor, vec3(0.45)) * 1.5;      // 抬亮暗调
float lum = dot(lifted, vec3(0.299, 0.587, 0.114));
lifted += vec3(0.08, 0.06, 0.03) * lum;            // 金色辉光增量
gl_FragColor = vec4(lifted, alpha * 0.95);
```

### 4.4 光照与交互

- `AmbientLight(0x404040, 2)` + `DirectionalLight(0xffeebb, 1.5)` + `PointLight(0xd4af37, 2, 20)`
- 点光源每帧 `Math.sin/cos(t*0.3)` 轨道运动 → 动态金色闪烁
- `OrbitControls`：damping 0.05 / autoRotate 0.6 / minDistance 4 / maxDistance 30
- 双击重置相机到 `(0, 0, 14)`

### 4.5 友好提示
- 加载中 `SUMMONING THE FOOL...`（金色 pulse 动画）
- 失败提示：`ZERO PARTICLES` / `FAILED TO LOAD IMAGE`（红色）
- 顶部右侧控制说明（LMB/RMB/Scroll/Double Click）

---

## 5. 可借鉴到 Arrodes 的点

| TheFool 亮点 | Arrodes 对应 | 建议 |
|---|---|---|
| 图片→粒子化（像素采样） | HomePlanet / Avatar | 可让 Avatar 用同样方式粒子化（3D 立体的愚者） |
| ShaderMaterial 波浪+摇摆 | 星空 Star | 已在 v4.2 实现 GPU 化（Now12），可借鉴 alpha/size 双 attribute |
| 亮度→Z 轴外凸 | 主星球电路纹理 | 给星球高光区做微 Z 凸起（伪凹凸） |
| `pow(vColor, 0.45) * 1.5` 抬亮暗调 | TTS 字幕/星空粒子 | 增强深色主题下的粒子可见性 |
| 金色 PointLight 轨道 | 主星球辉光 | 同步应用到 3D 星球营造"灵韵" |
| 滚轮缩放+锚定算法 | Sidebar 缩放/Avatar 大小 | 已应用类似思路 |
| 无边框透明 + WA_ShowWithoutActivating | （桌面壳方向） | 如果 Arrodes 走 Tauri/Electron 桌面壳，可复用此模式 |
| `resource_path()` 兼容打包 | （未来桌面版） | Tauri/Electron 资源加载的同款套路 |
| `app.setQuitOnLastWindowClosed(False)` | （桌面壳方向） | 关闭面板但保留后台服务 |

---

## 6. 文件清单

```
TheFool/
├── desktop_pet.py                374 行  桌面宠物主程序
├── index.html                    333 行  Web 3D 粒子艺术
├── character_no_bg.png           857 KB  角色立绘（去底）
├── character.jpg                 452 KB  原始角色图
├── the-fool.png                 1.6 MB   用于 Web 粒子化的高清塔罗图
├── huaban-6282590820.jpg         452 KB  来源花瓣网素材
├── build.bat                      13 行  PyInstaller 一键打包脚本
├── 桌宠-愚者.spec                 38 行  PyInstaller 配置
├── __pycache__/                          Python 缓存
├── build/桌宠-愚者/                      PyInstaller 构建产物（PKG/ZIP/toc）
├── dist/
│   ├── 桌宠-愚者.exe              50 MB   最终可执行
│   └── 使用说明.txt                       用户文档
└── uploads/                               （空）
```

---

## 7. 已知小问题 & 建议

1. **资源路径硬编码**：`build.bat` 用 `D:\python3.14.3\python.exe`，迁移机器需改路径。建议改用 `py -3.14` 或读取环境变量。
2. **`huaban-6282590820.jpg`** 与 **`character.jpg`** 重复占用：原图与去底图同源，建议只保留 `character_no_bg.png`。
3. **`uploads/` 空目录**：冗余，可删除。
4. **`dist/` 已在 .gitignore**（v5.2 清理），但 `build/` 还在仓库内（53 MB 冗余），建议加入 .gitignore。
5. **`localpycs/` 与 `__pycache__/`**：建议加入 .gitignore。
6. **Web 版本无 README/使用说明**：浏览器双击 `index.html` 需配合 `the-fool.png` 同目录，建议加一段 README 说明。
7. **远端仓库 `TheFoolworkspace`**：不存在/不可访问。如果用户期望有独立仓库，需要先在 GitHub 上 `Create new repo`，再 `git remote add` + push。

---

## 8. 结论

TheFool 是 Arrodes「愚者」IP 的轻量衍生艺术包，代码量小但设计感强：
- **桌宠版**展示了 PySide6 无边框透明窗体的标准模式（Tool + WA_ShowWithoutActivating + setQuitOnLastWindowClosed(False)）
- **Web 版**展示了图片→粒子化的完整 Three.js + 自定义 Shader 模板（像素采样 + 亮度 Z 映射 + 抬亮色调 + 圆形软光 + 轨道点光源）

**最值得 Arrodes 借鉴的两点**：
1. **粒子化 Avatar**：用 `samplePixels` 把 character_no_bg.png 转 3D Points + Shader，做出 4D 效果的愚者立绘（与 HomePlanet 联动）
2. **`pow(color, 0.45) * 1.5` 抬亮公式**：直接可用于改善暗色主题下所有粒子/星空的可读性

---

*生成时间：2026-08-06 20:11 GMT+8*