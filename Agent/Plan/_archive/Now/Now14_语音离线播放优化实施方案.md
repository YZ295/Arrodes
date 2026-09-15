# Now14 — AI 语音离线播放优化实施方案 v1.0

> 日期：2026-08-06
> 状态：方案评审中
> 依据：GitHub/掘金/知乎/开源社区 8 篇深度研究（CosyVoice2、Qwen3-TTS、AudioWorklet、Formmy Voice AI、juejin 音频优化等）

---

## 一、问题诊断（当前实现 vs 业界最佳）

| 维度 | 当前实现 | 业界最佳 | 差距 |
|------|---------|---------|------|
| TTS 引擎 | 仅 Edge TTS（云端，微软免费 API） | 云端 + 本地离线引擎降级链 | 断网即哑 |
| 播放方式 | `<audio>` 播 base64 data-URI | Blob URL / 流式分句 | base64 内存膨胀 33% |
| 长文本 | 一次性合成全部再播 | 分句合成 + 逐句流式播 | 首包延迟高、内存峰值大 |
| 播放队列 | 无（靠代际计数器硬切） | 预加载队列 + drain 协议 | 有缝隙/卡顿 |
| 异常处理 | 失败即静音+提示 | 引擎降级链 + 熔断 + 重试 | 单点故障 |
| 离线能力 | ❌ 无 | 本地模型可离线 | 核心缺口 |

---

## 二、目标架构

```
┌─ 前端 (React) ─────────────────────────────────────┐
│  useTTS (播放队列 + 预加载 + 代际中断)               │
│    ├─ AudioPlayer (Blob URL + 预加载下一段)          │
│    └─ 引擎选择器 (getBestAvailable + 熔断)           │
└──────────────┬─────────────────────────────────────┘
               │ HTTP /api/v1/tts/*
┌──────────────▼─────────────────────────────────────┐
│  Node.js 后端 (Express)                             │
│  TtsService: 引擎路由 → 降级链 → 音频缓存(LRU 50MB) │
│    ├─ Engine A: Edge TTS (云端，现有)                │
│    ├─ Engine B: 离线 TTS Sidecar (本地模型)          │
│    └─ Engine C: 历史音频缓存回放 (终极兜底)          │
└──────────────┬─────────────────────────────────────┘
               │ HTTP :12001 (FastAPI sidecar)
┌──────────────▼─────────────────────────────────────┐
│  Python TTS Sidecar (可选安装)                      │
│  CosyVoice2 0.5B / Spark-TTS 0.5B (离线推理)       │
└────────────────────────────────────────────────────┘
```

**关键决策**：离线 TTS 用 **Python FastAPI sidecar** 而非 Node 内嵌——CosyVoice2/Fish 都是 PyTorch 生态，Node 侧只做 HTTP 代理。Sidecar 懒启动（首次需要离线语音时 spawn），不拖累主服务启动。

---

## 三、离线 TTS 引擎选型（研究结论）

### 推荐矩阵

| 引擎 | 中文 MOS | 显存 | 协议 | 场景 | 结论 |
|------|---------|------|------|------|------|
| **CosyVoice 2 (0.5B)** | 4.7 | ~4GB | Apache 2.0 | 主力离线引擎 | ✅ **首选**：工程最成熟，Docker/API 齐全 |
| **Spark-TTS (0.5B)** | — | 1-2GB | Apache 2.0 | 无独显兜底 | ✅ 备选：最低资源 |
| Qwen3-TTS (0.6B) | — | 2GB | Apache 2.0 | 低延迟对话 | ⚠️ 不可变速，pass |
| Fish Speech | 高 | 4-6GB | 需确认 | 克隆音色 | ⚠️ 商用协议坑多，暂缓 |
| F5-TTS (0.3B) | 3.8 | 3GB | MIT | 快速验证 | 备选，音质偏低 |
| Edge TTS | — | 0 | 免费 | 云端主力 | 保留为 Engine A |

### 选型结论
- **有独显（≥4GB）**：CosyVoice 2 —— 中文自然度最高、方言、零样本克隆
- **无独显**：Spark-TTS 0.5B（1-2GB 显存）或 Qwen3-TTS-0.6B INT8 CPU 版（8GB 内存）
- **全部无法安装**：降级到 Engine C（历史音频缓存）

---

## 四、播放架构设计

### 4.1 弃用 base64，改 Blob URL + 磁盘缓存

```
现状：GET synthesize → { audioBase64 } → data:audio/mp3;base64,xxx → <audio>.src
改后：POST synthesize → 音频存 server/data/tts/xxx.mp3 → 返回 { audioUrl: '/tts/audio/xxx.mp3' }
     前端 <audio>.src = '/tts/audio/xxx.mp3' (HTTP Range 请求，浏览器原生流式)
```

收益：
- base64 内存膨胀消除（-33%）
- 浏览器原生 HTTP 流式解码，长音频不占满内存
- 音频文件可 LRU 复用（相同文本不重复合成）

### 4.2 分句合成 + 预加载队列

```
长文本 → 按句切分 (。！？；\n)
  ┌─ 句1 → 合成 → 播放中
  ├─ 句2 → 合成 → 预加载 (fetch audioUrl, 不播放)
  ├─ 句3 → 合成 → 预加载
  └─ ...
播放完句1 → 立即播句2（已预加载，零延迟）
```

收益：
- 首包延迟 = 第一句合成时间（~300ms），非全文合成时间
- 内存峰值 = 单句音频大小（长文本时降 90%+）
- 中断粒度 = 句级（代际计数器检查点）

### 4.3 播放器（AudioPlayer 组件）

```ts
class AudioPlayer {
  private audio: HTMLAudioElement;          // 单例复用
  private queue: AudioItem[];               // 预加载队列
  private currentGen: number;               // 代际
  
  play(text, gen) {
    this.queue.push({ text, gen });
    if (!this.audio.paused) return;         // 已在播，排队
    this.playNext();
  }
  
  private async playNext() {
    const item = this.queue.shift();
    if (!item || item.gen !== this.currentGen) return;  // 代际过期丢弃
    const url = await this.ensureAudio(item.text);      // 已缓存直接返回
    this.audio.src = url;
    this.audio.onended = () => this.playNext();
    await this.audio.play();
  }
}
```

### 4.4 弃用 per-chunk AudioBufferSourceNode（研究教训）

Formmy 实测：每个 chunk 创建 AudioBufferSourceNode → GC 压力 + 主线程 onended 回调缝隙 → 加 200ms jitter buffer 反而更卡。
**结论**：普通 TTS 播放用 `<audio>` + 预加载足够；**不做** WebSocket chunk 流式（除非未来做实时对话），避免过度设计。

---

## 五、性能与内存优化

| 优化项 | 方案 | 收益 |
|--------|------|------|
| 音频存储 | 文件 + HTTP Range，弃 base64 | 内存 -33%，长文本 -90% |
| 缓存策略 | 磁盘 LRU 50MB（server/data/tts/） | 重复文本 0 合成 |
| 分句粒度 | 句级合成+播放 | 首包 300ms，峰值内存大幅下降 |
| 音频解码 | 浏览器原生（HTTP 流式） | 不占 JS 内存 |
| 引擎复用 | Sidecar 常驻，模型加载一次 | 二次合成 ~50ms |
| 节流 | 同文本 30s 内去重 | 防连点重复合成 |

---

## 六、异常处理与降级链

```
speak(text)
  └─ Engine A: Edge TTS (云端)
      ├─ 成功 → 播放
      └─ 失败 (网络/401/超时)
          └─ Engine B: 离线 TTS Sidecar
              ├─ 成功 → 播放
              └─ 失败 (模型未装/显存不足)
                  └─ Engine C: 历史音频缓存回放
                      ├─ 命中 → 播放 (旧音频)
                      └─ 未命中 → 提示「语音引擎不可用」静音
```

**熔断机制**：Engine A 连续失败 3 次 → 标记不可用 5 分钟，直接走 B；B 同理。恢复探测在后台进行。

**Sidecar 生命周期**：
- 懒启动：首次请求 B 时 spawn `python tts_sidecar.py --port 12001`
- 健康检查：`GET /health`，无响应 10s 判死重启
- 优雅退出：主服务关闭时 kill

---

## 七、实施步骤（3 阶段）

### 阶段 1：播放架构重构（纯前端+后端改造，不动引擎）— 2h
- [ ] 后端：synthesize 返回 audioUrl（音频落盘）+ `/tts/audio/:file` 静态路由 + LRU 清理
- [ ] 前端：useTTS 改用 Blob URL + 预加载队列 + 句级中断（代际检查在句切分处）
- [ ] 验证：长文本（500 字）首包 <500ms，内存峰值降 80%

### 阶段 2：离线 Sidecar 接入 — 半天
- [ ] Python 侧：`tts_sidecar.py`（FastAPI + CosyVoice2，`/synthesize` 返回 wav 文件路径）
- [ ] 后端：TtsService 加 Engine B（HTTP 代理 + 懒启动 + 健康检查 + 熔断）
- [ ] 前端：TTSControl 显示引擎状态（云端/离线/缓存）

### 阶段 3：增强（可选，视效果）— 半天
- [ ] 相同文本去重缓存（内容 hash → LRU）
- [ ] 分句顺序保证（乱序到达排序）
- [ ] 引擎切换 UI 手动指定

---

## 八、风险与对策

| 风险 | 对策 |
|------|------|
| CosyVoice2 安装重（pynini 等） | 提供 install.bat 一键脚本；失败自动降级 Spark-TTS |
| 无独显机器跑不动 | Spark-TTS/Qwen3-TTS-0.6B INT8 CPU 兜底 |
| Sidecar 进程管理复杂 | systemd 式自愈：崩溃自动重启，最多 3 次 |
| Electron 打包体积增大 | 模型**不进安装包**，首次需要时提示下载（可选） |

---

## 九、验证指标

| 指标 | 目标 |
|------|------|
| 断网后仍可播 | ✅ 有离线引擎则播，无则缓存回放 |
| 500 字长文本首包 | < 500ms |
| 500 字长文本内存峰值 | < 20MB（现 base64 方案 ~200MB） |
| 连续 10 句无卡顿缝隙 | ✅ |
| 引擎故障恢复 | < 30s 自动切换 |
