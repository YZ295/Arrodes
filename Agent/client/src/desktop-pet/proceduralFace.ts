/**
 * 程序化桌宠角色的情绪→五官映射（纯函数）
 *
 * 路线 A：SVG 分层原创角色，全部表情由代码驱动（眨眼/口型/呼吸/呆毛）。
 * 无模型文件、无版权依赖，角色为阿罗德斯专属。
 */

import type { PetTone } from './live2dPet';

export interface PetFace {
  /** 眼睛形态 */
  eyes: 'open' | 'happy' | 'half' | 'squeeze';
  /** 嘴形 */
  mouth: 'smile' | 'open' | 'flat' | 'wavy' | 'frown';
  /** 脸红强度 0~1 */
  blush: number;
  /** 呆毛兴奋度 0~1（影响摆动幅度） */
  ahoge: number;
  /** 汗滴（ uncertain 专属） */
  sweat: boolean;
}

export function resolvePetFace(mood: PetTone): PetFace {
  switch (mood) {
    case 'ready':
      return { eyes: 'happy', mouth: 'open', blush: 0.7, ahoge: 0.9, sweat: false };
    case 'working':
      return { eyes: 'half', mouth: 'flat', blush: 0, ahoge: 0.25, sweat: false };
    case 'uncertain':
      return { eyes: 'open', mouth: 'wavy', blush: 0.2, ahoge: 0.4, sweat: true };
    case 'error':
      return { eyes: 'squeeze', mouth: 'frown', blush: 0, ahoge: 1, sweat: true };
    default:
      return { eyes: 'open', mouth: 'smile', blush: 0.35, ahoge: 0.5, sweat: false };
  }
}
