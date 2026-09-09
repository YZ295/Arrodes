import { useCallback, useEffect, useRef, useState } from 'react';
import avatarUrl from '../assets/arrodes_desktop_pet.png';
import { sendPetBounds, sendPetCommand, useDesktopPetSnapshot } from './desktopPetBridge';
import { createDesktopPetViewModel, type DesktopPetSnapshot } from './desktopPetState';
import { usePetChat } from './usePetChat';
import { PET_MODEL_URL, startLive2dPet, type Live2dPetController } from './live2dPet';
import ProceduralPet from './ProceduralPet';
import { startVrmPet, type VrmPetController } from './vrmPet';
declare global {
  interface Window {
    EmotionBall?: {
      create: (el: HTMLElement, opts?: Record<string, unknown>) => {
        setEmotion: (id: string) => void;
        handleAIMessage: (msg: unknown) => void;
        setGaze: (x: number, y: number) => void;
        destroy: () => void;
      };
    };
  }
}
import PetCameraPanel from './PetCameraPanel';
import {
  clampPetPosition,
  isClickGesture,
  loadStoredPetPosition,
  pickPetReaction,
  resolvePetHostMode,
  storePetPosition,
} from './petInteraction';
import './desktopPet.css';

const PET_SIZE = { width: 660, height: 600 };
const REACTION_VISIBLE_MS = 4_000;
/** 桌宠视觉：vrm（3D 角色，默认）/ procedural（程序化「小阿」）/ live2d（Mao）/ png（静态立绘） */
const PET_VISUAL = (import.meta.env.VITE_PET_VISUAL || 'vrm') as 'vrm' | 'procedural' | 'live2d' | 'png';

export default function DesktopPetOverlay({ initialSnapshot }: { initialSnapshot?: DesktopPetSnapshot }) {
  const snapshot = useDesktopPetSnapshot(initialSnapshot);
  const [interactive, setInteractive] = useState(true);
  const view = createDesktopPetViewModel(snapshot.observation, snapshot);
  const confidence = view.confidence === null ? null : Math.round(view.confidence * 100);

  const hostMode = resolvePetHostMode();
  // 等比缩放：以 660x600 设计稿为基准，窗口变小整体等比缩（气泡永不遮脸）
  const [petScale, setPetScale] = useState(1);
  useEffect(() => {
    const compute = (w: number, h: number) => {
      const scale = Math.min(w / 660, h / 600);
      setPetScale(Math.max(0.3, Math.min(1.25, scale)));
    };
    if (hostMode === 'electron') {
      window.arrodesPet?.onBounds((b) => compute(b.width, b.height));
    } else {
      const onResize = () => compute(window.innerWidth, window.innerHeight);
      window.addEventListener('resize', onResize);
      onResize();
      return () => window.removeEventListener('resize', onResize);
    }
  }, [hostMode]);

  const [position, setPosition] = useState<{ x: number; y: number } | null>(() => (
    hostMode === 'browser' ? loadStoredPetPosition() : null
  ));
  const [reaction, setReaction] = useState<string | null>(null);
  const [bouncing, setBouncing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [cameraPanelOpen, setCameraPanelOpen] = useState(false);
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chat = usePetChat(chatOpen);
  const lastReply = [...chat.messages].reverse().find((m) => m.role === 'pet');
  const chatVisible = chatOpen;

  // Live2D 立绘（可选视觉）：加载成功替换 PNG，失败无缝回退；procedural 模式下不启动
  const live2dContainerRef = useRef<HTMLDivElement | null>(null);
  const live2dRef = useRef<Live2dPetController | null>(null);
  const [live2dActive, setLive2dActive] = useState(false);
  const toneRef = useRef(view.tone);
  toneRef.current = view.tone;

  useEffect(() => {
    if (PET_VISUAL !== 'live2d') return;
    let cancelled = false;
    const container = live2dContainerRef.current;
    if (!container || !PET_MODEL_URL) return;
    void startLive2dPet(container).then((controller) => {
      if (cancelled) {
        controller?.destroy();
        return;
      }
      if (controller) {
        live2dRef.current = controller;
        controller.setTone(toneRef.current);
        setLive2dActive(true);
      }
    });
    return () => {
      cancelled = true;
      live2dRef.current?.destroy();
      live2dRef.current = null;
      setLive2dActive(false);
    };
  }, []);

  useEffect(() => {
    live2dRef.current?.setTone(view.tone);
    vrmRef.current?.setTone(view.tone);
  }, [view.tone]);

  // VRM 3D 角色（路线 B，默认视觉）：加载失败自动降级 procedural
  const vrmContainerRef = useRef<HTMLDivElement | null>(null);
  const vrmRef = useRef<VrmPetController | null>(null);
  const [vrmActive, setVrmActive] = useState(false);
  const [vrmFailed, setVrmFailed] = useState(false);

  // ===== 形象系统：小球（EmotionBall，默认）/ VRM =====
  const [avatar, setAvatar] = useState<'ball' | 'vrm'>(() => {
    try { return localStorage.getItem('arrodes_pet_avatar') === 'vrm' ? 'vrm' : 'ball'; } catch { return 'ball'; }
  });
  const ballContainerRef = useRef<HTMLDivElement | null>(null);
  const ballRef = useRef<{ setEmotion: (id: string) => void; handleAIMessage: (msg: unknown) => void; setGaze: (x: number, y: number) => void; destroy: () => void } | null>(null);
  const [ballReady, setBallReady] = useState(false);

  // 面板切换形象：localStorage + 自定义事件
  useEffect(() => {
    const onChange = (e: Event) => {
      const mode = (e as CustomEvent<'ball' | 'vrm'>).detail;
      setAvatar(mode);
      try { localStorage.setItem('arrodes_pet_avatar', mode); } catch { /* 忽略 */ }
    };
    window.addEventListener('arrodes-pet-avatar', onChange);
    return () => window.removeEventListener('arrodes-pet-avatar', onChange);
  }, []);

  // 小球引擎：按序加载 4 个脚本后创建实例（ball 模式才加载）
  useEffect(() => {
    if (avatar !== 'ball') { ballRef.current?.destroy(); ballRef.current = null; setBallReady(false); return; }
    let cancelled = false;
    const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`加载失败: ${src}`));
      document.head.appendChild(el);
    });
    (async () => {
      try {
        if (!window.EmotionBall) {
          for (const f of ['rings', 'emotions', 'ball', 'engine']) {
            await loadScript(`/emotion-ball/js/${f}.js`);
          }
        }
        if (cancelled || !ballContainerRef.current) return;
        const EB = window.EmotionBall;
        if (!EB) throw new Error('EmotionBall 未加载');
        const instance = EB.create(ballContainerRef.current, {
          emotion: '02', idle: true, autostart: true,
        });
        if (cancelled) { instance.destroy(); return; }
        ballRef.current = instance as unknown as typeof ballRef.current;
        setBallReady(true);
      } catch (cause) {
        console.warn('[DesktopPet] 小球引擎加载失败，回退 VRM:', cause);
        if (!cancelled) {
          setAvatar('vrm');
          try { localStorage.setItem('arrodes_pet_avatar', 'vrm'); } catch { /* 忽略 */ }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [avatar]);

  // 状态 → 表情映射
  useEffect(() => {
    const ball = ballRef.current;
    if (avatar !== 'ball' || !ball || !ballReady) return;
    let id = '02';
    if (snapshot.error) id = '34';
    else if (snapshot.analyzing) id = '30';
    else if (chat?.recording) id = '35';
    else if (snapshot.active) id = '40';
    else if (chatVisible && lastReply) id = '39';
    ball.handleAIMessage({ emotionId: id });
  }, [avatar, ballReady, snapshot.error, snapshot.analyzing, snapshot.active, chat?.recording, chatVisible, lastReply]);

  // 目标注视：指针位置归一化
  useEffect(() => {
    if (avatar !== 'ball') return;
    const onMove = (e: PointerEvent) => {
      ballRef.current?.setGaze((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [avatar]);

  useEffect(() => {
    if (PET_VISUAL !== 'vrm' || avatar !== 'vrm') return;
    let cancelled = false;
    const container = vrmContainerRef.current;
    if (!container) return;
    startVrmPet(container).then((controller) => {
      if (cancelled) {
        controller?.destroy();
        return;
      }
      if (controller) {
        vrmRef.current = controller;
        controller.setTone(toneRef.current);
        setVrmActive(true);
      } else {
        setVrmFailed(true);
      }
    }).catch((cause) => {
      console.warn('[DesktopPet] VRM 初始化失败，回退程序化角色:', cause instanceof Error ? cause.message : cause);
      setVrmFailed(true);
    });
    return () => {
      cancelled = true;
      vrmRef.current?.destroy();
      vrmRef.current = null;
    };
  }, [avatar]);

  useEffect(() => () => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
  }, []);

  const showReaction = useCallback(() => {
    setReaction((prev) => pickPetReaction(prev ?? undefined));
    setBouncing(true);
    setTimeout(() => setBouncing(false), 450);
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    reactionTimer.current = setTimeout(() => setReaction(null), REACTION_VISIBLE_MS);
  }, []);

  const onAvatarPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startedAt = Date.now();
    let totalDelta = 0;
    const base = loadStoredPetPosition() ?? { x: 0, y: 0 };
    let previousScreenX = event.screenX;
    let previousScreenY = event.screenY;

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const delta = Math.abs(dx) + Math.abs(dy);
      totalDelta = Math.max(totalDelta, delta);
      if (delta <= 6) return;
      if (hostMode === 'electron') {
        window.arrodesPet?.moveBy(moveEvent.screenX - previousScreenX, moveEvent.screenY - previousScreenY);
        previousScreenX = moveEvent.screenX;
        previousScreenY = moveEvent.screenY;
      } else {
        const next = clampPetPosition({ x: base.x + dx, y: base.y + dy }, { width: window.innerWidth, height: window.innerHeight }, PET_SIZE);
        storePetPosition(next);
        setPosition(next);
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!isClickGesture({ totalDelta, durationMs: Date.now() - startedAt })) {
        if (hostMode === 'browser') {
          setPosition((prev) => {
            const next = clampPetPosition(prev ?? { x: 0, y: 0 }, { width: window.innerWidth, height: window.innerHeight }, PET_SIZE);
            storePetPosition(next);
            return next;
          });
        }
        return;
      }
      live2dRef.current?.playTap();
      showReaction();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [hostMode, showReaction]);

  // Electron 模式：应用上次保存的窗口大小（机位面板「窗口大小」滑条写入）
  useEffect(() => {
    if (hostMode !== 'electron') return;
    try {
      const width = Number(localStorage.getItem('arrodes_pet_window_width'));
      if (Number.isFinite(width) && width >= 440 && width <= 990 && width !== 660) {
        window.arrodesPet?.resize(width, Math.round((width * 600) / 660));
      }
    } catch { /* 忽略 */ }
  }, [hostMode]);

  // Electron 模式：窗口边界变化广播给主窗口（观察帧裁剪用）+ 启动时应用保存的透明度
  useEffect(() => {
    if (hostMode !== 'electron') return;
    window.arrodesPet?.onBounds((bounds) => sendPetBounds(bounds));
    try {
      const saved = Number(localStorage.getItem('arrodes_pet_opacity'));
      if (Number.isFinite(saved) && saved >= 0.15 && saved < 1) {
        window.arrodesPet?.setOpacity(saved);
      }
    } catch { /* 忽略 */ }
  }, [hostMode]);

  // Electron 模式：交互/装饰模式订阅 + 双击切换 + 淡出态控制
  useEffect(() => {
    if (hostMode !== 'electron') return;
    window.arrodesPet?.onInteractive(setInteractive);
  }, [hostMode]);

  // Electron 模式：视觉状态同步给主进程（托盘菜单标签）
  useEffect(() => {
    if (hostMode !== 'electron') return;
    window.arrodesPet?.notifyVisionState(snapshot.active);
  }, [hostMode, snapshot.active]);

  // Electron 模式：右键菜单「视觉观察」命令 → 广播给主窗口切换
  useEffect(() => {
    if (hostMode !== 'electron') return;
    window.arrodesPet?.onVisionToggle(() => sendPetCommand('vision-toggle'));
  }, [hostMode]);

  // Electron 模式：悬停桌宠时暂停点击穿透，离开后恢复（forward:true 下 DOM 仍能收到事件）
  const onRootEnter = useCallback(() => {
    if (hostMode === 'electron') window.arrodesPet?.setInteractive(true);
  }, [hostMode]);
  const onRootLeave = useCallback(() => {
    if (hostMode === 'electron') window.arrodesPet?.setInteractive(false);
  }, [hostMode]);

  const bubbleLine = chatVisible && lastReply
    ? lastReply.content
    : reaction ?? view.state;

  return (
    <main
      className={`desktop-pet desktop-pet--${view.tone}${hostMode === 'electron' && !interactive ? ' pet-decorative' : ''}`}
      aria-label="阿罗德斯桌面管家"
      onDoubleClick={() => { if (hostMode === 'electron') window.arrodesPet?.toggleInteractive(); }}
      onMouseEnter={onRootEnter}
      onMouseLeave={onRootLeave}
      style={{
        ...(position ? { left: position.x, top: position.y } : {}),
        ...(hostMode === 'electron' ? { transform: `scale(${petScale})`, transformOrigin: 'bottom right' } : {}),
      }}
      data-positioned={position ? 'true' : 'false'}
    >
      <section className="desktop-pet__bubble" aria-live="polite" aria-atomic="true">
        <div className="desktop-pet__meta">
          <span className="desktop-pet__status"><i aria-hidden="true" />{view.status}</span>
          {view.diagnostics && (
            <span
              className="desktop-pet__diagnostics"
              data-role="diagnostics"
              title={`${view.diagnostics.model}${view.diagnostics.observedAt ? ` · ${view.diagnostics.observedAt}` : ''}`}
            >
              {(view.diagnostics.durationMs / 1000).toFixed(1)}s
            </span>
          )}
          {confidence !== null && <span className="desktop-pet__confidence">把握 {confidence}%</span>}
        </div>
        {!chatVisible && <h1>{view.title}</h1>}
        <p className="desktop-pet__state" data-role="bubble-line">{bubbleLine}</p>
        {!chatVisible && view.action && (
          <div className="desktop-pet__action" data-role="next-action">
            <span>下一步</span>
            <p>{view.action}</p>
          </div>
        )}
        {!chatVisible && view.note && <p className="desktop-pet__note">{view.note}</p>}
        {chatVisible && chat.error && <p className="desktop-pet__note" data-role="chat-error">{chat.error}</p>}
        {chatVisible && (
          <div className="desktop-pet__chatbar" data-role="chatbar">
            <input
              value={chat.draft}
              onChange={(event) => chat.setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void chat.sendDraft();
              }}
              placeholder="和我说点什么…"
              aria-label="桌宠对话输入"
            />
            <button
              type="button"
              data-role="pet-mic"
              className={chat.recording ? 'is-recording' : ''}
              onClick={() => { if (chat.recording) void chat.stopVoice(); else chat.startVoice(); }}
              aria-label={chat.recording ? '结束录音' : '开始录音'}
            >🎙</button>
            <button
              type="button"
              data-role="pet-send"
              onClick={() => { void chat.sendDraft(); }}
              disabled={chat.thinking || !chat.draft.trim()}
              aria-label="发送"
            >发送</button>
          </div>
        )}
        {chatVisible && chat.thinking && <p className="desktop-pet__note">正在思考…</p>}
      </section>
      <button
        type="button"
        className={`desktop-pet__avatar${bouncing ? ' is-bouncing' : ''}`}
        data-role="pet-avatar"
        onPointerDown={onAvatarPointerDown}
        onDoubleClick={() => setChatOpen((prev) => !prev)}
        aria-label="阿罗德斯桌面助手角色"
      >
        {avatar === 'ball' && <div ref={ballContainerRef} className="desktop-pet__ball" aria-hidden="true" />}
        {PET_VISUAL === 'vrm' && avatar === 'vrm' && <div ref={vrmContainerRef} className="desktop-pet__vrm" aria-hidden="true" />}
        {PET_VISUAL === 'vrm' && !vrmActive && vrmFailed && <ProceduralPet mood={view.tone} />}
        {PET_VISUAL === 'procedural' && <ProceduralPet mood={view.tone} />}
        {PET_VISUAL === 'live2d' && (
          <div
            ref={live2dContainerRef}
            className={`desktop-pet__live2d${live2dActive ? ' is-active' : ''}`}
            aria-hidden="true"
          />
        )}
        {PET_VISUAL !== 'vrm' && PET_VISUAL !== 'procedural' && !(PET_VISUAL === 'live2d' && live2dActive) && <img src={avatarUrl} alt="" draggable={false} />}
      </button>
      {PET_VISUAL === 'vrm' && vrmActive && (
        <button
          type="button"
          className="desktop-pet__cam-toggle"
          data-role="cam-toggle"
          onClick={() => setCameraPanelOpen((prev) => !prev)}
          aria-label={cameraPanelOpen ? '关闭机位调试' : '打开机位调试'}
        >📷</button>
      )}
      {cameraPanelOpen && vrmRef.current && (
        <PetCameraPanel controller={vrmRef.current} onClose={() => setCameraPanelOpen(false)} />
      )}
      <button
        type="button"
        className="desktop-pet__chat-toggle"
        data-role="chat-toggle"
        onClick={() => setChatOpen((prev) => !prev)}
        aria-label={chatOpen ? '收起对话' : '打开对话'}
      >{chatOpen ? '×' : '对话'}</button>
    </main>
  );
}
