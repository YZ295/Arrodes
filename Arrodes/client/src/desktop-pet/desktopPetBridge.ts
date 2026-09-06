import { useEffect, useRef, useState } from 'react';
import type { DesktopPetSnapshot } from './desktopPetState';

const CHANNEL_NAME = 'arrodes-desktop-pet-v1';
const EMPTY_SNAPSHOT: DesktopPetSnapshot = {
  active: false,
  analyzing: false,
  error: null,
  observation: null,
};

type DesktopPetMessage =
  | { type: 'snapshot'; snapshot: DesktopPetSnapshot }
  | { type: 'request-snapshot' };

function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);
}

export function useDesktopPetPublisher(snapshot: DesktopPetSnapshot): void {
  const latestRef = useRef(snapshot);
  latestRef.current = snapshot;
  const { active, analyzing, error, observation } = snapshot;

  useEffect(() => {
    const channel = openChannel();
    if (!channel) return;
    const publish = () => channel.postMessage({ type: 'snapshot', snapshot: latestRef.current } satisfies DesktopPetMessage);
    channel.onmessage = (event: MessageEvent<DesktopPetMessage>) => {
      if (event.data?.type === 'request-snapshot') publish();
    };
    publish();
    return () => channel.close();
  }, []);

  useEffect(() => {
    const channel = openChannel();
    if (!channel) return;
    channel.postMessage({
      type: 'snapshot',
      snapshot: { active, analyzing, error, observation },
    } satisfies DesktopPetMessage);
    channel.close();
  }, [active, analyzing, error, observation]);
}

export function useDesktopPetSnapshot(initialSnapshot?: DesktopPetSnapshot): DesktopPetSnapshot {
  const [snapshot, setSnapshot] = useState(initialSnapshot || EMPTY_SNAPSHOT);

  useEffect(() => {
    if (initialSnapshot) return;
    const channel = openChannel();
    if (!channel) return;
    channel.onmessage = (event: MessageEvent<DesktopPetMessage>) => {
      if (event.data?.type === 'snapshot') setSnapshot(event.data.snapshot);
    };
    channel.postMessage({ type: 'request-snapshot' } satisfies DesktopPetMessage);
    return () => channel.close();
  }, [initialSnapshot]);

  return snapshot;
}
