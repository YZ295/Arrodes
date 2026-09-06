# 阿罗德斯 · 子系统文档 SS-UNI
# 宇宙核心引擎（Universe Core Engine）

> 版本：v1.0  
> 代号：UNI  
> 优先级：P0  
> 负责人：Crow5（前端 3D 方向）

---

## 一、模块定位

宇宙核心引擎是阿罗德斯的**视觉与交互基底**。用户打开应用，首先看到的就是这个模块渲染的 3D 宇宙空间。

**不负责**：语音处理、对话逻辑、数据存储  
**负责**：3D 场景渲染、星球实体、生长动画、相机控制、用户交互

---

## 二、核心概念

### 2.1 宇宙模型

```
宇宙是一个以原点 (0,0,0) 为中心的球形空间，半径 100 单位。

原点处固定着「主星球」——阿罗德斯之心，金色，半径 3.0，永不移动。

所有其他星球（会话星球）在宇宙空间内运动，受以下力约束：
- 主星球引力：将所有星球拉向中心，防止飘散
- 星球间斥力：防止星球重叠
- 初始切向速度：让星球形成轨道运动而非坠入中心
```

### 2.2 星球类型

| 类型 | 数量 | 位置 | 大小 | 颜色 | 特殊 |
|------|------|------|------|------|------|
| 主星球 | 1 | (0,0,0) 固定 | 半径 3.0 | 金色 #FFD700 | 脉冲发光、环形光晕、不可拖拽 |
| 会话星球 | 动态增长 | 轨道运动 | 半径 1.0~2.5 | 主题色 | 可点击、可拖拽 |
| 子星球 | 动态增长 | 绕父星球运动 | 半径 0.8~2.0 | 继承父主题 | 可点击、可拖拽 |

### 2.3 生长机制

```
触发条件：用户通过语音/UI 创建新会话

生长流程：
1. 源星球（主星球或父星球）开始高亮脉动
2. 射出一道光束，颜色 = 新星球主题色
3. 光束飞行 0.8s，带粒子拖尾
4. 到达目标位置，开始凝聚动画
5. 光点从 0 膨胀到目标半径，耗时 0.5s
6. 凝聚瞬间产生粒子爆发（10-20 个粒子散射后收回）
7. 新星球开始轨道运动
8. 相机飞行到新星球前（1s）
9. 语音系统收到 "universe:planet:spawned" 事件
```

---

## 三、功能需求

### 3.1 场景管理

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| UNI-001 | 初始化 3D 场景，背景 #0a0e27 | 加载 < 3s |
| UNI-002 | 星空背景：3000 颗粒子星星，有视差 | 相机移动时星星有深度感 |
| UNI-003 | 相机默认俯瞰主星球，距离 20 单位 | 主星球在画面中心 |
| UNI-004 | 相机 OrbitControls：旋转/缩放/平移 | 鼠标拖拽旋转，滚轮缩放 |
| UNI-005 | 相机平滑飞行到指定星球 | 1s 动画，easeInOut |
| UNI-006 | 场景边界：半径 100，超出拉回 | 星球不出界 |

### 3.2 主星球

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| UNI-101 | 位于原点，半径 3.0 | 视觉上明显大于普通星球 |
| UNI-102 | 金色金属材质 + 自发光 | 颜色 #FFD700，金属度 0.8 |
| UNI-103 | 脉冲动画：强度 0.8→1.2→0.8，周期 2s | 呼吸感 |
| UNI-104 | 多层环形光晕 | 内环窄亮，外环宽淡 |
| UNI-105 | 标签"阿罗德斯"始终显示 | 字体 18px，金色发光 |
| UNI-106 | 不可拖拽 | 固定位置 |
| UNI-107 | 点击触发 "universe:planet:click" 事件 | 事件参数 { sessionId: "home" } |

### 3.3 普通星球

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| UNI-201 | 半径 = 1.0 + log(msgCount+1) * 0.3 | 消息越多越大 |
| UNI-202 | 颜色由 topic 决定 | work=#3B82F6, life=#10B981, creative=#8B5CF6, emotion=#EF4444, study=#F59E0B, other=#6B7280 |
| UNI-203 | 发光强度随最后活跃时间衰减 | 24h内=1.0, 7d内=0.6, 30d内=0.3, 更久=0.1 |
| UNI-204 | 标签显示会话标题前 8 字 | 距离 < 50 单位时显示 |
| UNI-205 | LOD：距离 > 30 用低模 | 性能优化 |
| UNI-206 | 自转速度随活跃度变化 | 24h内=2rpm, 更久=0.5rpm |

### 3.4 生长动画

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| UNI-301 | 分裂光束：从源星球射出，颜色=主题色 | 0.8s 飞行 |
| UNI-302 | 光束带粒子拖尾 | 拖尾长度 5 单位 |
| UNI-303 | 凝聚动画：0→目标半径，0.5s | 弹性缓动 |
| UNI-304 | 凝聚时粒子爆发 | 10-20 个粒子 |
| UNI-305 | 新星球初始位置：距源星球 15-25 单位，随机方向 | 球面均匀分布 |
| UNI-306 | 同一方向 30° 内不连续生成 | 避免重叠 |
| UNI-307 | 生长完成后发送 "universe:planet:spawned" 事件 | 事件总线 |

### 3.5 引力与运动

| 编号 | 需求 | 公式 |
|------|------|------|
| UNI-401 | 主星球引力 | F = 50 * 100 / r² |
| UNI-402 | 星球间斥力 | 距离 < 5 时，F = 10 / d² |
| UNI-403 | 阻尼衰减 | 速度 *= 0.98 / 帧 |
| UNI-404 | 边界约束 | 距离 > 100 时，速度反向，位置拉回 95 |
| UNI-405 | 初始切向速度 | 垂直于源星球方向，大小随机 0.5~1.5 |
| UNI-406 | 同主题弱引力 | 同主题星球额外吸引力，系数 0.3 |

### 3.6 交互

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| UNI-501 | 悬停：高亮 + 放大 1.2x + 工具提示 | 提示含标题+消息数+时间 |
| UNI-502 | 单击：选中 + 相机飞行 + 发送事件 | "universe:planet:click" |
| UNI-503 | 双击：发送 "universe:planet:doubleclick" | 语音系统接收后展开对话 |
| UNI-504 | 拖拽：可手动调整星球位置 | 拖拽后固定，其他星球自适应 |
| UNI-505 | 空白处点击：取消选中，相机回全景 | 2s 过渡 |
| UNI-506 | ESC：取消选中 | 即时 |
| UNI-507 | 触摸：单指旋转，双指缩放，长按显示菜单 | 移动端 |

### 3.7 轨道线

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| UNI-601 | 每个星球显示半透明轨道线 | 颜色=星球色，透明度 0.15 |
| UNI-602 | 轨道线随时间淡出 | 7 天未活跃透明度 0.05 |
| UNI-603 | 选中星球时轨道高亮 | 透明度 0.4 |

---

## 四、接口（与后端）

```typescript
// 前端期望从后端获取
GET /api/v1/sessions/tree
→ { sessions: SessionNode[] }

// 前端发送给后端（通过事件总线触发语音系统调用）
// 创建会话：由语音系统调用 API，成功后通知宇宙系统渲染
```

---

## 五、事件（与其他模块）

```typescript
// 宇宙系统 监听的事件（从其他模块来）
"voice:session:create" → 触发新星球生长
"voice:session:switch" → 相机飞行到目标星球
"nav:search:select" → 相机飞行到目标星球
"nav:list:select" → 相机飞行到目标星球

// 宇宙系统 发出的事件（给其他模块）
"universe:planet:click" → 语音系统展开面板
"universe:planet:doubleclick" → 语音系统进入对话
"universe:planet:spawned" → 语音系统切换会话
"universe:camera:arrived" → 导航系统更新状态
```

---

## 六、技术实现

### 6.1 核心文件

```
src/universe/
├── Universe.tsx              # 场景根组件，管理所有子组件
├── HomePlanet.tsx            # 主星球组件（金色、固定、脉冲）
├── Planet.tsx                # 普通星球组件（可复用）
├── SpawnAnimation.tsx        # 生长动画（光束+凝聚+粒子）
├── Starfield.tsx             # 星空背景
├── OrbitLine.tsx             # 轨道线
├── CameraController.tsx      # 相机控制（OrbitControls + 飞行）
├── GravitySystem.ts          # 引力计算（每帧更新）
└── effects/
    ├── BloomEffect.tsx       # 辉光后处理
    └── ParticleSystem.tsx    # 粒子系统
```

### 6.2 关键算法伪代码

```typescript
// 引力更新（每帧调用）
function updateGravity(planets: Planet[], deltaTime: number) {
  for (const planet of planets) {
    // 主星球引力
    const toHome = new Vector3(0,0,0).sub(planet.position);
    const distToHome = toHome.length();
    const forceHome = toHome.normalize().multiplyScalar(5000 / (distToHome * distToHome));

    // 星球间斥力
    let forceRepulse = new Vector3(0,0,0);
    for (const other of planets) {
      if (other.id === planet.id) continue;
      const diff = planet.position.clone().sub(other.position);
      const dist = diff.length();
      if (dist < 5) {
        forceRepulse.add(diff.normalize().multiplyScalar(10 / (dist * dist)));
      }
    }

    // 同主题引力
    let forceTheme = new Vector3(0,0,0);
    for (const other of planets) {
      if (other.topic === planet.topic && other.id !== planet.id) {
        const diff = other.position.clone().sub(planet.position);
        forceTheme.add(diff.normalize().multiplyScalar(0.3));
      }
    }

    // 应用合力
    const acceleration = forceHome.add(forceRepulse).add(forceTheme);
    planet.velocity.add(acceleration.multiplyScalar(deltaTime)).multiplyScalar(0.98);
    planet.position.add(planet.velocity.clone().multiplyScalar(deltaTime));

    // 边界约束
    if (planet.position.length() > 100) {
      planet.velocity.multiplyScalar(-0.5);
      planet.position.normalize().multiplyScalar(95);
    }
  }
}
```

---

## 七、验收清单

- [ ] 打开页面，看到金色主星球在星空中央脉动
- [ ] 鼠标拖拽旋转视角，滚轮缩放
- [ ] 点击主星球，控制台打印 "universe:planet:click home"
- [ ] 模拟创建 5 个新星球，看到光束+凝聚动画
- [ ] 新星球开始绕主星球运动，不重叠
- [ ] 悬停星球有高亮和工具提示
- [ ] 点击普通星球，相机飞行过去
- [ ] 拖拽星球可调整位置
- [ ] 100 个星球时帧率 ≥ 45fps

---

## 八、给 Crow5 的开发顺序

1. **Day 1-2**：搭建 3D 场景 + 主星球（金色球体+脉冲）
2. **Day 3-4**：相机控制（旋转/缩放/飞行）
3. **Day 5-6**：普通星球渲染（颜色/大小/标签）
4. **Day 7-8**：引力系统（运动+不重叠+边界）
5. **Day 9-10**：生长动画（光束+凝聚+粒子）
6. **Day 11-12**：交互（悬停/点击/拖拽/事件）
7. **Day 13-14**：轨道线 + 性能优化 + 验收
