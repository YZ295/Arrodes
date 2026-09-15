# 阿罗德斯 · 子系统文档 SS-ORB
# 引力与轨道系统（Gravity & Orbit System）

> 版本：v1.0  
> 代号：ORB  
> 优先级：P1  
> 负责人：Crow5（前端 3D 方向）
> 依赖：SS-UNI（宇宙核心引擎）完成后开发

---

## 一、模块定位

引力与轨道系统让阿罗德斯的宇宙**活起来**。星球不是静态的装饰品，而是有生命的实体——它们在引力场中运动、相互影响、形成星系。

**不负责**：星球渲染、用户交互、语音处理  
**负责**：物理模拟、轨道计算、运动更新、轨道线渲染

---

## 二、核心概念

### 2.1 力场模型

```
宇宙中有三种力：

1. 主星球引力（最强）
   F = G * M / r²
   将所有星球拉向中心，防止宇宙飘散

2. 星球间斥力（近距离）
   距离 < 5 时触发，防止重叠

3. 同主题引力（最弱）
   同主题星球互相吸引，形成"星系团"

加上阻尼衰减，最终达到动态平衡：
- 星球绕主星球公转
- 同主题星球聚集但不重叠
- 整体呈球形分布
```

### 2.2 轨道层级

```
一级轨道：会话星球绕主星球
  主星球 ◄─────── 项目A星球
         公转周期 30-60s

二级轨道：子星球绕父星球
  项目A星球 ◄─── 竞品调研星球
              公转周期 20-40s
              同时随父星球绕主星球

三级轨道：孙星球（最多3级，更深扁平化）
```

---

## 三、功能需求

### 3.1 引力计算

| 编号 | 需求 | 公式/参数 |
|------|------|---------|
| ORB-001 | 主星球引力 | F = 5000 / r²，方向指向原点 |
| ORB-002 | 星球间斥力 | 距离 < 5 时，F = 50 / d²，方向远离 |
| ORB-003 | 同主题引力 | 同主题额外 F = 0.5，方向靠近 |
| ORB-004 | 速度阻尼 | 每帧 velocity *= 0.98 |
| ORB-005 | 位置更新 | position += velocity * deltaTime |
| ORB-006 | 边界约束 | 距离 > 100 时，速度反向，位置拉回 95 |
| ORB-007 | 计算在 Web Worker 中执行 | 不阻塞渲染线程 |

### 3.2 初始条件

| 编号 | 需求 | 说明 |
|------|------|------|
| ORB-101 | 新星球初始位置 | 距源星球 15-25 单位，随机球面方向 |
| ORB-102 | 新星球初始速度 | 切向速度 0.5-1.5，垂直于源星球方向 |
| ORB-103 | 最小夹角约束 | 同一源星球 30° 内不连续生成 |
| ORB-104 | 子星球初始位置 | 距父星球 8-15 单位 |

### 3.3 轨道线

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| ORB-201 | 每个星球显示轨道线 | 颜色=星球色，透明度 0.15 |
| ORB-202 | 轨道线随时间淡出 | 7 天未活跃透明度 0.05 |
| ORB-203 | 选中星球轨道高亮 | 透明度 0.4 |
| ORB-204 | 轨道线不阻挡点击 | 射线检测穿透 |
| ORB-205 | 父子星球间显示虚线 | 表示层级关系 |

### 3.4 特殊效果

| 编号 | 需求 | 说明 |
|------|------|------|
| ORB-301 | 活跃星球轨道发光 | 24h 内活跃的星球轨道更亮 |
| ORB-302 | 新星球首圈轨道高亮 | 生成后前 3 圈轨道更亮 |
| ORB-303 | 拖拽星球后轨道重新计算 | 手动调整位置后自适应 |

---

## 四、技术实现

```typescript
// 引力系统核心（Web Worker 中运行）
class GravitySystem {
  private planets: Planet[];
  private homeMass = 100;
  private G = 50;
  private boundary = 100;
  private damping = 0.98;

  update(deltaTime: number) {
    for (const planet of this.planets) {
      let force = new Vector3(0, 0, 0);

      // 1. 主星球引力
      const toHome = new Vector3(0,0,0).sub(planet.position);
      force.add(toHome.normalize().multiplyScalar(
        this.G * this.homeMass / toHome.lengthSq()
      ));

      // 2. 星球间斥力
      for (const other of this.planets) {
        if (other.id === planet.id) continue;
        const diff = planet.position.clone().sub(other.position);
        const dist = diff.length();
        if (dist < 5 && dist > 0) {
          force.add(diff.normalize().multiplyScalar(10 / (dist * dist)));
        }
      }

      // 3. 同主题引力
      for (const other of this.planets) {
        if (other.topic === planet.topic && other.id !== planet.id) {
          const diff = other.position.clone().sub(planet.position);
          force.add(diff.normalize().multiplyScalar(0.3));
        }
      }

      // 应用
      planet.velocity.add(force.multiplyScalar(deltaTime));
      planet.velocity.multiplyScalar(this.damping);
      planet.position.add(planet.velocity.clone().multiplyScalar(deltaTime));

      // 边界
      if (planet.position.length() > this.boundary) {
        planet.velocity.reflect(planet.position.normalize()).multiplyScalar(0.5);
        planet.position.normalize().multiplyScalar(this.boundary * 0.95);
      }
    }
  }
}
```

---

## 五、验收清单

- [ ] 10 个星球绕主星球运动，不重叠
- [ ] 同主题星球自然聚集
- [ ] 新星球生成后进入稳定轨道
- [ ] 拖拽星球后其他星球自适应
- [ ] 轨道线正确显示
- [ ] 100 个星球时计算不卡顿（Web Worker）

---

## 六、开发顺序（1 周）

1. **Day 1-2**：引力计算（主引力+斥力+阻尼）
2. **Day 3**：同主题引力+边界约束
3. **Day 4**：轨道线渲染
4. **Day 5**：Web Worker 迁移
5. **Day 6**：拖拽自适应+特殊效果
6. **Day 7**：压力测试+调参
