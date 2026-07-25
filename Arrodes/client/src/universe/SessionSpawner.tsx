/**
 * SessionSpawner — 语音创建会话的事件桥接
 *
 * 监听 `voice:session:create` 事件，调用后端 API 创建会话，
 * 计算轨道位置，通过 UniverseStore 添加新星球并触发生长动画。
 */
import { useEffect } from 'react';
import { eventBus, EVENTS } from '../shared/events/EventBus';
import { useUniverseStore } from '../shared/stores/useUniverseStore';
import type { SessionNode } from '@shared/types';
import { calcSpawnPosition } from './utils/spawnPosition';

// 新会话默认带一条消息，让星球初始尺寸可见
const INITIAL_MESSAGE_COUNT = 1;

export default function SessionSpawner() {
  const addPlanet = useUniverseStore((s) => s.addPlanet);
  const planets = useUniverseStore((s) => s.planets);

  useEffect(() => {
    const unsubscribe = eventBus.on(EVENTS.VOICE_SESSION_CREATE, async (data: unknown) => {
      const { title, topic } = (data as { title?: string; topic?: string }) || {};
      const sessionTitle = title || '新会话';
      const sessionTopic = (topic as SessionNode['topic']) || 'other';

      try {
        const res = await fetch('/api/v1/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: sessionTitle, topic: sessionTopic }),
        });

        if (!res.ok) throw new Error(`createSession failed: ${res.status}`);

        const session: SessionNode = await res.json();

        // 计算新星球位置（基于当前非主星球数量）
        const nonHomeCount = planets.filter((p) => !p.isHome).length;
        const position = calcSpawnPosition(nonHomeCount);

        // 补充初始消息数，让星球可见
        const sessionWithCount = { ...session, messageCount: INITIAL_MESSAGE_COUNT };

        // 添加到宇宙（会自动触发 UNIVERSE_PLANET_SPAWNED）
        addPlanet(sessionWithCount, position);
      } catch (err) {
        console.error('[SessionSpawner] 创建会话失败:', err);
      }
    });

    return unsubscribe;
  }, [addPlanet, planets]);

  // 纯逻辑组件，不渲染任何 DOM/3D
  return null;
}
