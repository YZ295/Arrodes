interface StatusInput {
  connected: boolean;
  speaking: boolean;
  error: string | null;
  ttsError: string | null;
}

export function getStatusPresentation(input: StatusInput) {
  if (input.error) return { label: input.error, tone: 'error' as const, recoverableTts: false };
  if (input.ttsError) return { label: input.ttsError, tone: 'error' as const, recoverableTts: true };
  if (!input.connected) return { label: '正在连接', tone: 'pending' as const, recoverableTts: false };
  if (input.speaking) return { label: '正在播报', tone: 'active' as const, recoverableTts: false };
  return { label: '已连接', tone: 'ready' as const, recoverableTts: false };
}
