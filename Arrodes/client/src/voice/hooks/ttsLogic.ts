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
