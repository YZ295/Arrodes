/**
 * TTS 纯逻辑（可单测，无 DOM/React 依赖）
 */

/**
 * 判断音频是否可重播。
 * T7 移除云端后本地 CosyVoice 返回 audio/wav——只要 audio.src 存在即说明有可重播内容，
 * 不再按格式（mp3/wav）区分（旧逻辑反向判断 wav 导致本地重播失效，见 code-review C6）。
 */
export function canReplay(audio: { src: string } | null | undefined): boolean {
  return !!audio && !!audio.src;
}

/**
 * 重播操作：回到开头并播放。
 * 返回是否真正执行了重播（false = 无可用音频）。
 */
export function replayAudio(
  audio: HTMLAudioElement | null | undefined,
  onError?: (err: unknown) => void,
): boolean {
  if (!canReplay(audio)) return false;
  audio!.currentTime = 0;
  audio!.play().catch((err) => onError?.(err));
  return true;
}

/** 创建 TTS 私有取消控制器，并单向跟随整条对话管道的取消信号。 */
export function createLinkedAbortController(outerSignal?: AbortSignal): {
  controller: AbortController;
  dispose: () => void;
} {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (outerSignal?.aborted) controller.abort();
  else outerSignal?.addEventListener('abort', abort, { once: true });
  return {
    controller,
    dispose: () => outerSignal?.removeEventListener('abort', abort),
  };
}

/** 保留可用的当前 provider；失效时回退到首个已配置项。 */
export function chooseConfiguredProvider<T extends string>(
  current: T,
  providers: ReadonlyArray<{ id: T; configured: boolean }>,
): T {
  if (providers.some((provider) => provider.id === current && provider.configured)) return current;
  return providers.find((provider) => provider.configured)?.id ?? current;
}

/** 将 CosyVoice2 时代保存的引擎值迁移到当前规范 provider。 */
export function normalizeStoredProvider(value?: string): 'cosyvoice3' | 'audio8' {
  return value === 'audio8' ? 'audio8' : 'cosyvoice3';
}
