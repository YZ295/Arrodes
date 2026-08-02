/**
 * 宇宙状态管理（Zustand）
 * 管理所有星球数据、选中状态、相机目标
 */
import { create } from 'zustand';
import type { SessionNode, SessionTopic } from '@shared/types';
import { eventBus, EVENTS } from '../events/EventBus';

export interface PlanetVisualData {
  id: string;
  title: string;
  topic: SessionTopic;
  parentId: string | null;
  messageCount: number;
  lastActiveAt: string;
  createdAt: string;
  // 3D 空间位置（运行时填充）
  position?: { x: number; y: number; z: number };
  velocity?: { x: number; y: number; z: number };
  // 是否为根主星球
  isHome: boolean;
}

interface UniverseState {
  // 数据
  planets: PlanetVisualData[];
  selectedPlanetId: string | null;
  cameraTargetId: string | null;

  // 操作
  setPlanets: (sessions: SessionNode[]) => void;
  addPlanet: (session: SessionNode, position: { x: number; y: number; z: number }) => void;
  removePlanet: (id: string) => void;
  updatePlanet: (id: string, partial: Partial<PlanetVisualData>) => void;
  selectPlanet: (id: string | null) => void;
  setCameraTarget: (id: string | null) => void;

  // 物理
  getAllPositions: () => { id: string; x: number; y: number; z: number }[];
  updatePlanetPosition: (id: string, pos: { x: number; y: number; z: number }) => void;
  updatePlanetVelocity: (id: string, vel: { x: number; y: number; z: number }) => void;
}

export const useUniverseStore = create<UniverseState>((set, get) => ({
  planets: [
    {
      id: 'home',
      title: '阿罗德斯',
      topic: 'other',
      parentId: null,
      messageCount: 0,
      lastActiveAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      isHome: true,
    },
  ],
  selectedPlanetId: null,
  cameraTargetId: null,

  setPlanets: (sessions) => {
    const planets: PlanetVisualData[] = [
      {
        id: 'home',
        title: '阿罗德斯',
        topic: 'other',
        parentId: null,
        messageCount: 0,
        lastActiveAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        isHome: true,
      },
      ...sessions.map((s) => ({
        id: s.id,
        title: s.title,
        topic: s.topic,
        parentId: s.parentId,
        messageCount: s.messageCount,
        lastActiveAt: s.lastActiveAt,
        createdAt: s.createdAt,
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        isHome: false,
      })),
    ];
    set({ planets });
  },

  addPlanet: (session, position) => {
    const newPlanet: PlanetVisualData = {
      id: session.id,
      title: session.title,
      topic: session.topic,
      parentId: session.parentId,
      messageCount: session.messageCount,
      lastActiveAt: session.lastActiveAt,
      createdAt: session.createdAt,
      position,
      velocity: { x: 0, y: 0, z: 0 },
      isHome: false,
    };
    set((state) => ({ planets: [...state.planets, newPlanet] }));
    // 通知宇宙系统新星球已生成
    eventBus.emit(EVENTS.UNIVERSE_PLANET_SPAWNED, { sessionId: session.id, position });
  },

  removePlanet: (id) => {
    set((state) => ({
      planets: state.planets.filter((p) => p.id !== id),
      selectedPlanetId: state.selectedPlanetId === id ? null : state.selectedPlanetId,
    }));
  },

  updatePlanet: (id, partial) => {
    set((state) => ({
      planets: state.planets.map((p) => (p.id === id ? { ...p, ...partial } : p)),
    }));
  },

  selectPlanet: (id) => {
    set({ selectedPlanetId: id });
  },

  setCameraTarget: (id) => {
    set({ cameraTargetId: id });
  },

  getAllPositions: () => {
    return get().planets
      .filter((p) => p.position)
      .map((p) => ({
        id: p.id,
        x: p.position!.x,
        y: p.position!.y,
        z: p.position!.z,
      }));
  },

  updatePlanetPosition: (id, pos) => {
    set((state) => ({
      planets: state.planets.map((p) =>
        p.id === id ? { ...p, position: pos } : p
      ),
    }));
  },

  updatePlanetVelocity: (id, vel) => {
    set((state) => ({
      planets: state.planets.map((p) =>
        p.id === id ? { ...p, velocity: vel } : p
      ),
    }));
  },
}));
