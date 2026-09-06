/**
 * Live2D 桌宠控制器（步骤 3）
 *
 * 运行时：pixi.js 7 + pixi-live2d-display-lipsyncpatch（Cubism 4）
 * 模型：Live2D 官方免费示例 Haru（CDN 加载，联调用；正式立绘可后续替换 URL）
 *
 * 设计：
 * - 加载失败（离线/CDN 不可达）时返回 null，调用方回退到 PNG 立绘，桌宠功能不受影响
 * - 口型由共享音频电平 store 驱动（useTTS/useVoiceRecorder 已在写入）
 * - 表情状态机：pet tone（idle/working/ready/uncertain/error）→ Cubism 表情/待机动作
 */

import { useAudioLevelStore } from '../shared/stores/useAudioLevelStore';
import type { Application, Container, Ticker as PixiTicker } from 'pixi.js';

const CUBISM_CORE_URL = '/live2d/live2dcubismcore.min.js';
/** 默认使用本地 Mao（Live2D 官方免费示例，自带 8 表情 + 8 动作）；可用 VITE_PET_MODEL_URL 换任意 model3.json 地址 */
export const PET_MODEL_URL = import.meta.env.VITE_PET_MODEL_URL || '/live2d/Mao/Mao.model3.json';

export type PetTone = 'idle' | 'working' | 'ready' | 'uncertain' | 'error';

/** tone → Cubism 表情名（Mao 自带 exp_01~exp_08） */
export function resolvePetExpression(tone: PetTone): string | null {
  switch (tone) {
    case 'ready': return 'exp_01';
    case 'working': return 'exp_02';
    case 'uncertain': return 'exp_03';
    case 'error': return 'exp_06';
    default: return null;
  }
}

/** 点击反应 → Cubism 动作组（Mao 自带 Idle/TapBody） */
export function resolvePetTapMotion(): string {
  return 'TapBody';
}

let corePromise: Promise<void> | null = null;

function loadCubismCore(): Promise<void> {
  corePromise ??= new Promise((resolve, reject) => {
    if (document.querySelector('script[data-live2d-core]')) { resolve(); return; }
    const script = document.createElement('script');
    script.src = CUBISM_CORE_URL;
    script.async = true;
    script.dataset.live2dCore = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Cubism Core 加载失败'));
    document.head.append(script);
  });
  return corePromise;
}

export interface Live2dPetController {
  destroy(): void;
  setTone(tone: PetTone): void;
  playTap(): void;
}

// 单飞：并发挂载（React StrictMode / HMR）共享同一次加载，避免 CubismFramework 重复 startUp 竞态与画布泄漏
let live2dLoadPromise: Promise<Live2dPetController | null> | null = null;
let live2dLoadFailed = false;

/** 在容器内启动 Live2D；失败返回 null（调用方回退 PNG），可再次调用重试 */
export function startLive2dPet(container: HTMLElement, modelUrl = PET_MODEL_URL): Promise<Live2dPetController | null> {
  if (!modelUrl) return Promise.resolve(null);
  if (live2dLoadPromise && !live2dLoadFailed) return live2dLoadPromise;
  live2dLoadFailed = false;
  live2dLoadPromise = doStartLive2dPet(container, modelUrl)
    .catch((cause) => {
      console.warn('[DesktopPet] Live2D 初始化失败，回退静态立绘:', cause instanceof Error ? cause.message : cause);
      return null;
    })
    .then((controller) => {
      if (!controller) live2dLoadFailed = true; // 允许下次重试
      return controller;
    });
  return live2dLoadPromise;
}

async function doStartLive2dPet(container: HTMLElement, modelUrl: string): Promise<Live2dPetController | null> {
  // Cubism Core 必须先于插件模块加载（插件在模块求值时校验运行时）
  await loadCubismCore();
  const [{ Application, Ticker }, { Live2DModel, MotionPriority }] = await Promise.all([
    import('pixi.js'),
    import('pixi-live2d-display-lipsyncpatch/cubism4'),
  ]) as [typeof import('pixi.js'), typeof import('pixi-live2d-display-lipsyncpatch/cubism4')];

  const app = new Application({
    backgroundAlpha: 0,
    autoStart: true,
    resizeTo: container,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  }) as Application;
  container.append(app.view as HTMLCanvasElement);
  Live2DModel.registerTicker(Ticker as unknown as typeof PixiTicker);

  try {
    const model = await Live2DModel.from(modelUrl, { autoInteract: false });
    app.stage.addChild(model as unknown as Container);

    // 上半身取景：模型显示高度约为容器高度的 1.9 倍，锚点取模型 28% 高度处（约颈部）
    // 固定在容器 72% 高度上——脸（模型顶部 ~10%）稳定落在窗口上 1/3 区域。
    model.scale.set(1);
    const natural = model.getBounds();
    const naturalHeight = natural.height || 1;
    model.scale.set((container.clientHeight * 1.9) / naturalHeight);
    model.anchor?.set(0.5, 0.28);
    const layout = () => {
      model.position.set(
        (container.clientWidth || PET_WIDTH) * 0.5,
        (container.clientHeight || PET_HEIGHT) * 0.72,
      );
    };
    layout();
    const resizeObserver = new ResizeObserver(layout);
    resizeObserver.observe(container);

    // 口型：轮询共享音频电平（speaking 模式下 outputLevel 0~255 → MouthOpenY 0~1）
    const core = (model.internalModel as { coreModel: { setParameterValueById(id: string, v: number): void } }).coreModel;
    const tickerCallback = () => {
      const audio = useAudioLevelStore.getState();
      const level = audio.mode === 'speaking' ? audio.outputLevel : 0;
      core.setParameterValueById('ParamMouthOpenY', Math.min(1, level / 160));
    };
    app.ticker.add(tickerCallback);

    let currentTone: PetTone = 'idle';
    const applyTone = () => {
      const expression = resolvePetExpression(currentTone);
      if (expression) void model.expression(expression).catch(() => { /* 表情缺失不影响 */ });
    };
    applyTone();

    return {
      destroy() {
        app.ticker.remove(tickerCallback);
        resizeObserver.disconnect();
        model.destroy();
        app.destroy(true, { children: true });
      },
      setTone(tone: PetTone) {
        if (tone === currentTone) return;
        currentTone = tone;
        applyTone();
      },
      playTap() {
        void model.motion(resolvePetTapMotion(), undefined, MotionPriority.FORCE).catch(() => { /* 动作缺失不影响 */ });
      },
    };
  } catch (cause) {
    // 失败即清理：半初始化的画布不能留在 DOM 里（会叠加在 PNG 回退之上并泄漏内存）
    app.destroy(true, { children: true, removeView: true });
    throw cause;
  }
}

export const PET_WIDTH = 420;
export const PET_HEIGHT = 600;
