import { useCallback, useEffect, useRef, useState } from 'react';
import avatarUrl from '../assets/arrodes_desktop_pet.png';
import { sendPetBounds, sendPetCommand, useDesktopPetSnapshot } from './desktopPetBridge';
import { createDesktopPetViewModel, type DesktopPetSnapshot } from './desktopPetState';
import { usePetChat } from './usePetChat';
import { useVoiceSessionState } from './useVoiceSession';
import { mountAura, type AuraController } from './ParticleAura';
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
  resolvePetHostMode,
  storePetPosition,
} from './petInteraction';
import './desktopPet.css';

const PET_SIZE = { width: 660, height: 600 };
/** 桌宠视觉：vrm（3D 角色，默认）/ procedural（程序化「小阿」）/ live2d（Mao）/ png（静态立绘） */
const PET_VISUAL = (import.meta.env.VITE_PET_VISUAL || 'vrm') as 'vrm' | 'procedural' | 'live2d' | 'png';

export default function DesktopPetOverlay({ initialSnapshot }: { initialSnapshot?: DesktopPetSnapshot }) {
  const snapshot = useDesktopPetSnapshot(initialSnapshot);
  const [interactive, setInteractive] = useState(true);
  // 新鲜度要会走：面板只持有最后一次观察，时间标签必须自己更新，
  // 否则「3 分钟前」会永远停在 3 分钟前
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const view = createDesktopPetViewModel(snapshot.observation, snapshot, now);
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
  const [bouncing, setBouncing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [cameraPanelOpen, setCameraPanelOpen] = useState(false);

  const chat = usePetChat(chatOpen);
  const voiceState = useVoiceSessionState(chat);
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
  const [avatar, setAvatar] = useState<'ball' | 'vrm' | 'image'>(() => {
    try {
      const v = localStorage.getItem('arrodes_pet_avatar');
      return v === 'vrm' || v === 'image' ? v : 'ball';
    } catch { return 'ball'; }
  });
  const [avatarTs, setAvatarTs] = useState(() => Date.now());
  const ballContainerRef = useRef<HTMLDivElement | null>(null);
  const ballRef = useRef<{ setEmotion: (id: string) => void; handleAIMessage: (msg: unknown) => void; setGaze: (x: number, y: number) => void; destroy: () => void } | null>(null);
  const [ballReady, setBallReady] = useState(false);
  // T8 粒子光环：与球体同生命周期挂载，状态由语音会话态+观察态驱动
  const auraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const auraRef = useRef<AuraController | null>(null);
  useEffect(() => {
    if (avatar !== 'ball' || !ballReady) {
      auraRef.current?.destroy();
      auraRef.current = null;
      return;
    }
    const canvas = auraCanvasRef.current;
    if (!canvas) return;
    const controller = mountAura(canvas);
    auraRef.current = controller;
    // 挂载即同步一次状态（否则 setState effect 因依赖未变而跳过，光环初始态丢失）
    controller.setState({ voice: voiceState, observing: snapshot.active });
    return () => {
      controller.destroy();
      auraRef.current = null;
    };
  }, [avatar, ballReady]);
  useEffect(() => {
    auraRef.current?.setState({ voice: voiceState, observing: snapshot.active });
  }, [voiceState, snapshot.active]);
  const [butlerEngineRunning, setButlerEngineRunning] = useState(false);
  useEffect(() => {
    if (hostMode !== 'electron') return;
    window.arrodesPet?.onButlerEngine(setButlerEngineRunning);
  }, [hostMode]);

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

  // 跨窗口形象切换（管家标签页 / 其他窗口经 BroadcastChannel 派发）
  useEffect(() => {
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('arrodes-desktop-pet-v1') : null;
    if (!channel) return;
    channel.onmessage = (event: MessageEvent) => {
      const d = event.data as { type?: string; mode?: 'ball' | 'vrm' | 'image'; ts?: number };
      if (d?.type !== 'avatar-set' || !d.mode) return;
      setAvatar(d.mode);
      setAvatarTs(d.ts ?? Date.now());
      try { localStorage.setItem('arrodes_pet_avatar', d.mode); } catch { /* 忽略 */ }
    };
    return () => { channel.onmessage = null; channel.close(); };
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

  // 状态 → 表情映射（T9：语音会话态优先，视觉观察态兜底）
  // ambient=02待机 / listening=35等待输入 / thinking=30思考 / speaking=39输出 / muted=04发呆(不在听)
  useEffect(() => {
    const ball = ballRef.current;
    if (avatar !== 'ball' || !ball || !ballReady) return;
    let id = '02';
    if (snapshot.error) id = '34';
    else if (voiceState === 'muted') id = '04';
    else if (voiceState === 'thinking' || snapshot.analyzing) id = '30';
    else if (voiceState === 'speaking') id = '39';
    else if (voiceState === 'listening') id = '35';
    else if (butlerEngineRunning) id = '32';
    else if (snapshot.active) id = '40';
    ball.handleAIMessage({ emotionId: id });
  }, [avatar, ballReady, butlerEngineRunning, snapshot.error, snapshot.analyzing, snapshot.active, voiceState]);

  // 目标注视：Electron 跟随全局光标（主进程归一化，T5）；浏览器模式跟随窗口内指针
  useEffect(() => {
    if (avatar !== 'ball') return;
    if (hostMode === 'electron') {
      window.arrodesPet?.onGaze((nx, ny) => ballRef.current?.setGaze(nx, ny));
      return;
    }
    const onMove = (e: PointerEvent) => {
      ballRef.current?.setGaze((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [avatar, hostMode]);

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
    if (bounceTimer.current) clearTimeout(bounceTimer.current);
  }, []);

  // T4 球体单击：播报中=打断；否则=麦克风静音切换（拖拽由 isClickGesture 区分）
  const bounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAvatarTap = useCallback(() => {
    setBouncing(true);
    if (bounceTimer.current) clearTimeout(bounceTimer.current);
    bounceTimer.current = setTimeout(() => setBouncing(false), 450);
    if (chat.speaking) chat.interrupt();
    else chat.toggleMicMuted();
  }, [chat]);

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
      onAvatarTap();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [hostMode, onAvatarTap]);

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
    : view.state;

  // 话少模式：气泡平时隐藏，仅在有输出时显示 6 秒后淡出（对话打开时常驻）
  const [bubbleShown, setBubbleShown] = useState(false);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showBubbleTemporarily = useCallback((ms = 6_000) => {
    setBubbleShown(true);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubbleShown(false), ms);
  }, []);
  const lastReplyId = lastReply?.id ?? '';
  useEffect(() => {
    if (lastReplyId) showBubbleTemporarily();
  }, [lastReplyId, showBubbleTemporarily]);
  useEffect(() => {
    if (!chatVisible && view.action) showBubbleTemporarily();
  }, [chatVisible, view.action, showBubbleTemporarily]);
  const bubbleVisible = chatVisible || bubbleShown;

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
      <section
        className={`desktop-pet__bubble${bubbleVisible ? '' : ' desktop-pet__bubble--hidden'}`}
        data-visible={bubbleVisible ? 'true' : 'false'}
        data-freshness={view.freshness.level}
        aria-hidden={!bubbleVisible}
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="desktop-pet__meta">
          <span className="desktop-pet__status"><i aria-hidden="true" />{view.status}</span>
          {/* 新鲜度：面板只持有最后一次观察，必须说清它是什么时候的 */}
          <span
            className="desktop-pet__freshness"
            data-role="freshness"
            data-level={view.freshness.level}
          >
            {view.freshness.label}
          </span>
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
        <div
          className="desktop-pet__bubble-scroll"
          data-role="bubble-scroll"
          tabIndex={0}
          aria-label="桌宠回复内容"
        >
          {!chatVisible && <h1>{view.title}</h1>}
          <p className="desktop-pet__state" data-role="bubble-line">{bubbleLine}</p>
          {!chatVisible && view.action && (
            <div className="desktop-pet__action" data-role="next-action">
              <span>下一步</span>
              <p>{view.action}</p>
            </div>
          )}
          {!chatVisible && view.verification && (
            <p className="desktop-pet__verification" data-role="verification">
              <span aria-hidden="true">
                {view.verification.result === 'confirmed' ? '✓' : view.verification.result === 'failed' ? '✗' : '…'}
              </span>
              {view.verification.text}
            </p>
          )}
          {!chatVisible && view.note && <p className="desktop-pet__note">{view.note}</p>}
          {chatVisible && chat.error && <p className="desktop-pet__note" data-role="chat-error">{chat.error}</p>}
        </div>
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
        {avatar === 'ball' && (
          <div ref={ballContainerRef} className="desktop-pet__ball" aria-hidden="true">
            <canvas ref={auraCanvasRef} className="desktop-pet__aura" data-role="pet-aura" />
          </div>
        )}
        {avatar === 'image' && (
          <img
            src={`/api/v1/butler-avatar?ts=${avatarTs}`}
            alt=""
            className="desktop-pet__image"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
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
      {(avatar === 'ball' || (PET_VISUAL === 'vrm' && vrmActive)) && (
        <button
          type="button"
          className="desktop-pet__cam-toggle"
          data-role="cam-toggle"
          onClick={() => setCameraPanelOpen((prev) => !prev)}
          aria-label={cameraPanelOpen ? '关闭机位调试' : '打开机位调试'}
        >📷</button>
      )}
      {cameraPanelOpen && (
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
