# 阿罗德斯 · 子系统文档 SS-THM
# 主题与个性化系统（Theme & Personalization System）

> 版本：v1.0  
> 代号：THM  
> 优先级：P2  
> 负责人：Crow5（前端 UI 方向）

---

## 一、模块定位

主题系统让阿罗德斯**适应不同主人的品味**。有人偏爱深邃的星空，有人喜欢温暖的黄昏，有人追求极简的黑暗。

---

## 二、功能需求

### 2.1 预设主题

| 主题名 | 背景色 | 主星球色 | 星云色 | 风格 |
|--------|--------|---------|--------|------|
| **深渊**（默认） | #0a0e27 | 金色 #FFD700 | 蓝紫 | 神秘、科技 |
| **黄昏** | #1a0e0a | 橙色 #F97316 | 橙红 | 温暖、古典 |
| **虚空** | #000000 | 白色 #FFFFFF | 灰白 | 极简、冷峻 |
| **翡翠** | #0a1a0e | 翠绿 #10B981 | 青绿 | 自然、生机 |
| **蔷薇** | #1a0a12 | 粉红 #EC4899 | 粉紫 | 柔和、梦幻 |

### 2.2 自定义主题

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| THM-001 | 用户可自定义主星球颜色 | 色相环选择器 |
| THM-002 | 用户可自定义背景色 | 颜色选择器 |
| THM-003 | 用户可调整辉光强度 | 滑块低/中/高 |
| THM-004 | 用户可调整粒子密度 | 滑块 |
| THM-005 | 用户可调整轨道线透明度 | 滑块 |
| THM-006 | 设置持久化 | localStorage |

### 2.3 角色称呼自定义

| 编号 | 需求 | 默认 |
|------|------|------|
| THM-101 | 用户可设置对 AI 的称呼 | "阿罗德斯" |
| THM-102 | 用户可设置 AI 对自己的称呼 | "愚者大人" |
| THM-103 | 提供预设称呼组合 | 古典/现代/可爱 |

---

## 三、技术实现

```css
/* CSS 变量主题系统 */
:root[data-theme="abyss"] {
  --universe-bg: #0a0e27;
  --universe-bg-gradient: radial-gradient(ellipse at center, #1a1f4b 0%, #0a0e27 100%);
  --home-planet-color: #FFD700;
  --home-planet-glow: rgba(255, 215, 0, 0.6);
  --nebula-color-1: #4c1d95;
  --nebula-color-2: #1e3a8a;
  --star-color: #e2e8f0;
  --orbit-line-opacity: 0.15;
  --bloom-strength: 1.5;
}

:root[data-theme="dusk"] {
  --universe-bg: #1a0e0a;
  --universe-bg-gradient: radial-gradient(ellipse at center, #4a1810 0%, #1a0e0a 100%);
  --home-planet-color: #F97316;
  --home-planet-glow: rgba(249, 115, 22, 0.6);
  --nebula-color-1: #9a3412;
  --nebula-color-2: #7c2d12;
  --star-color: #fde68a;
  --orbit-line-opacity: 0.12;
  --bloom-strength: 1.8;
}
```

---

## 四、验收清单

- [ ] 5 套预设主题可切换
- [ ] 切换时宇宙颜色平滑过渡（1s）
- [ ] 自定义颜色实时预览
- [ ] 设置刷新后保留
- [ ] 角色称呼可自定义

---

## 五、开发顺序（3 天）

1. **Day 1**：CSS 变量主题系统 + 5 套预设
2. **Day 2**：自定义面板（颜色/辉光/粒子）
3. **Day 3**：角色称呼设置 + 持久化
