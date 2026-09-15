# 阿罗德斯 · 子系统文档 SS-FX
# 星云特效系统（Nebula Effects System）

> 版本：v1.0  
> 代号：FX  
> 优先级：P2  
> 负责人：Crow5（前端 3D 方向）
> 依赖：SS-UNI（宇宙核心引擎）完成后开发

---

## 一、模块定位

星云特效系统为阿罗德斯的宇宙**注入灵魂**。它不负责功能，负责氛围——让宇宙看起来像一个活着的、有呼吸的、神秘的空间。

**不负责**：功能逻辑、数据处理  
**负责**：视觉特效、氛围渲染、动画增强

---

## 二、核心概念

```
阿罗德斯的宇宙不是死寂的太空，而是充满生命力的微缩星系：

- 背景星云：远处漂浮的彩色云雾，缓慢流动
- 星球辉光：活跃星球散发柔和光芒
- 分裂光束：新星球诞生时的神圣光芒
- 记忆连线：相关星球间的微弱光丝
- 粒子轨迹：信息在宇宙中流动的可视化
```

---

## 三、功能需求

### 3.1 背景星云

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| FX-001 | 远处有 3-5 团彩色星云 | 使用 Shader 生成 |
| FX-002 | 星云缓慢流动、旋转 | 周期 60-120s |
| FX-003 | 星云颜色随主题变化 | 默认蓝紫色 |
| FX-004 | 星云透明度低（0.1-0.2） | 不遮挡星球 |
| FX-005 | 星云有视差效果 | 相机移动时有深度感 |

### 3.2 星球辉光（Bloom）

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| FX-101 | 主星球强辉光（金色） | UnrealBloomPass |
| FX-102 | 活跃星球中等辉光 | 24h 内活跃 |
| FX-103 | 沉寂星球弱辉光 | 30d 以上 |
| FX-104 | 选中星球辉光增强 | 视觉聚焦 |
| FX-105 | 辉光强度可调（设置中） | 低/中/高 |

### 3.3 分裂光束特效

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| FX-201 | 光束从源星球射出 | 颜色=新星球主题色 |
| FX-202 | 光束带粒子拖尾 | 拖尾长度 5 单位 |
| FX-203 | 光束飞行速度匀速 | 0.8s 到达 |
| FX-204 | 光束到达时爆发 | 粒子散射 |
| FX-205 | 光束音效（可选） | 空灵音效 |

### 3.4 记忆连线

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| FX-301 | 同主题星球间有微弱连线 | 透明度 0.08 |
| FX-302 | 连线有缓慢流动动画 | 如能量流动 |
| FX-303 | 选中星球时相关连线高亮 | 透明度 0.3 |
| FX-304 | 连线不阻挡点击 | 射线穿透 |

### 3.5 粒子特效

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| FX-401 | 主星球周围有金色粒子环 | 缓慢旋转 |
| FX-402 | 活跃对话时星球周围有能量环 | 向外扩散 |
| FX-403 | 新消息产生时粒子飞向星球 | 轨迹 1s |
| FX-404 | 记忆保存时星球闪烁粒子 | 2 次闪烁 |

### 3.6 后处理

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| FX-501 | Bloom 辉光 | 柔和不刺眼 |
| FX-502 | 景深（DOF） | 聚焦星球清晰，背景模糊 |
| FX-503 | 色调映射 | 色彩自然 |
| FX-504 | 抗锯齿 | 边缘平滑 |

---

## 四、技术实现

```typescript
// 特效系统架构
class EffectsSystem {
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private nebulaShader: ShaderMaterial;
  private particleSystem: Points;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    // 后处理管线
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    // Bloom
    this.bloomPass = new UnrealBloomPass(
      new Vector2(window.innerWidth, window.innerHeight),
      1.5,  // strength
      0.4,  // radius
      0.85  // threshold
    );
    this.composer.addPass(this.bloomPass);

    // 星云 Shader
    this.nebulaShader = new ShaderMaterial({
      vertexShader: nebulaVertexShader,
      fragmentShader: nebulaFragmentShader,
      transparent: true,
      depthWrite: false,
    });
  }

  render() {
    this.composer.render();
  }

  setBloomStrength(intensity: 'low' | 'medium' | 'high') {
    const map = { low: 0.8, medium: 1.5, high: 2.5 };
    this.bloomPass.strength = map[intensity];
  }
}
```

---

## 五、验收清单

- [ ] 背景有流动的彩色星云
- [ ] 主星球有金色辉光
- [ ] 新星球分裂时有光束+粒子
- [ ] 同主题星球间有微弱连线
- [ ] 活跃对话时有能量环
- [ ] 特效全开时帧率 ≥ 45fps
- [ ] 低性能模式可关闭大部分特效

---

## 六、开发顺序（1 周）

1. **Day 1-2**：Bloom 辉光系统
2. **Day 3**：星云 Shader
3. **Day 4**：分裂光束+粒子
4. **Day 5**：记忆连线
5. **Day 6**：粒子特效（能量环、轨迹）
6. **Day 7**：性能优化+低性能模式
