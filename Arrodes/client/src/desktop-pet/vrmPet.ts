/**
 * VRM 3D 桌宠控制器（路线 B）
 *
 * 运行时：three.js + @pixiv/three-vrm v3（同时支持 VRM 0.x / 1.0）
 * 模型：public/vrm/arrodes.vrm（VRoid Studio 导出，版权属于用户）
 *
 * 动画全部代码驱动：
 * - 口型同步：rAF 读共享音频电平 → VRM 表情 'aa'
 * - 自动眨眼：随机间隔 → 'blink'
 * - 情绪：pet tone → 表情（happy/relaxed/sad/angry）
 * - 待机：轻微呼吸摆动 + 视线回正
 * - 加载失败返回 null，调用方回退到下一级视觉
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { useAudioLevelStore } from '../shared/stores/useAudioLevelStore';
import { mergeCameraConfig, type VrmCameraConfig } from './petCamera';

export const VRM_URL = '/vrm/arrodes.vrm';

export type PetTone = 'idle' | 'working' | 'ready' | 'uncertain' | 'error';

/** tone → VRM 标准表情（VRoid 默认表情组） */
export function resolveVrmExpression(tone: PetTone): string | null {
  switch (tone) {
    case 'ready': return 'happy';
    case 'working': return 'relaxed';
    case 'uncertain': return 'sad';
    case 'error': return 'angry';
    default: return null;
  }
}

export interface VrmPetController {
  destroy(): void;
  setTone(tone: PetTone): void;
  playTap(): void;
  /** 机位面板实时调整：更新 fov/距离/高度/水平/收臂并立即生效 */
  setCamera(config: Partial<VrmCameraConfig>): void;
}

const BLINK_INTERVAL_MIN_MS = 2_000;
const BLINK_INTERVAL_MAX_MS = 5_400;

function randomBlinkDelay(): number {
  return BLINK_INTERVAL_MIN_MS + Math.random() * (BLINK_INTERVAL_MAX_MS - BLINK_INTERVAL_MIN_MS);
}

export async function startVrmPet(
  container: HTMLElement,
  modelUrl = VRM_URL,
  cameraConfig?: Partial<VrmCameraConfig>,
): Promise<VrmPetController | null> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth || 420, container.clientHeight || 600);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);

  try {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, (container.clientWidth || 420) / (container.clientHeight || 600), 0.1, 20);

    const light = new THREE.DirectionalLight(0xffffff, 1.1);
    light.position.set(1, 1.6, 1.4).normalize();
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xbcd0ff, 0.75));

    const gltfLoader = new GLTFLoader();
    gltfLoader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await gltfLoader.loadAsync(modelUrl);
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) throw new Error('文件不是有效的 VRM 模型');
    scene.add(vrm.scene);
    VRMUtils.rotateVRM0(vrm); // VRM 0.x 面向 +Z

    // 资源释放
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);

    // 收臂：VRM 静息姿态是 T-pose，把上臂骨转下去让手臂自然下垂（角度可由机位面板调整）
    const setBoneRotationZ = (boneName: 'leftUpperArm' | 'rightUpperArm', z: number) => {
      const node = vrm.humanoid?.getNormalizedBoneNode(boneName);
      if (node) node.rotation.z = z;
    };
    const camConfig = mergeCameraConfig(cameraConfig ?? {});
    setBoneRotationZ('leftUpperArm', -camConfig.armAngle);
    setBoneRotationZ('rightUpperArm', camConfig.armAngle);

    // 按头骨位置自动取景：观察目标 = 头骨 + 用户偏移；相机 = 目标 + 用户距离/抬升
    vrm.update(0.001);
    const headNode = vrm.humanoid?.getNormalizedBoneNode('head');
    const lookTarget = new THREE.Vector3(0, 1.22, 0);
    if (headNode) {
      const headPos = new THREE.Vector3();
      headNode.getWorldPosition(headPos);
      lookTarget.set(headPos.x, headPos.y, headPos.z);
    }
    lookTarget.y += camConfig.targetHeightOffset;
    lookTarget.x += camConfig.horizontalOffset;

    const applyCamera = () => {
      camera.fov = camConfig.fov;
      camera.updateProjectionMatrix();
      camera.position.set(
        lookTarget.x,
        lookTarget.y + camConfig.verticalOffset,
        lookTarget.z + camConfig.distance,
      );
      camera.lookAt(lookTarget);
    };
    applyCamera();

    const expression = vrm.expressionManager;
    const setExpression = (name: string, weight: number) => {
      expression?.setValue(name, weight);
    };

    let currentTone: PetTone = 'idle';
    let expressionName: string | null = null;
    const applyTone = () => {
      if (expressionName) setExpression(expressionName, 0);
      expressionName = resolveVrmExpression(currentTone);
      if (expressionName) setExpression(expressionName, 1);
    };
    applyTone();

    // 自动眨眼
    let blinkUntil = 0;
    let nextBlink = performance.now() + randomBlinkDelay();

    const clock = new THREE.Clock();
    let raf = 0;
    let swayTime = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const delta = clock.getDelta();
      swayTime += delta;
      const now = performance.now();

      // 口型同步（speaking 时）
      const audio = useAudioLevelStore.getState();
      const open = audio.mode === 'speaking' ? Math.min(1, audio.outputLevel / 170) : 0;
      setExpression('aa', open);

      // 眨眼
      if (now >= nextBlink) {
        blinkUntil = now + 130;
        nextBlink = now + randomBlinkDelay();
      }
      setExpression('blink', now < blinkUntil ? 1 : 0);

      // 待机呼吸：轻微前后摆 + 身体上下
      vrm.scene.rotation.y = Math.sin(swayTime * 0.7) * 0.06;
      vrm.scene.position.y = Math.sin(swayTime * 1.4) * 0.006;

      vrm.update(delta);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    const resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth || 420;
      const height = container.clientHeight || 600;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(container);

    return {
      destroy() {
        cancelAnimationFrame(raf);
        resizeObserver.disconnect();
        VRMUtils.deepDispose(vrm.scene);
        renderer.dispose();
        renderer.domElement.remove();
      },
      setTone(tone: PetTone) {
        if (tone === currentTone) return;
        currentTone = tone;
        applyTone();
      },
      playTap() {
        // 点击反应：happy 表情闪一下 + 小跳
        setExpression('happy', 1);
        const baseY = vrm.scene.position.y;
        const start = performance.now();
        const hop = () => {
          const t = (performance.now() - start) / 420;
          if (t >= 1) {
            vrm.scene.position.y = baseY;
            if (expressionName) setExpression(expressionName, 1);
            else setExpression('happy', 0);
            return;
          }
          vrm.scene.position.y = baseY + Math.sin(t * Math.PI) * 0.03;
          requestAnimationFrame(hop);
        };
        hop();
      },
      setCamera(update: Partial<VrmCameraConfig>) {
        const next = mergeCameraConfig({ ...camConfig, ...update });
        const heightDelta = next.targetHeightOffset - camConfig.targetHeightOffset;
        const horizontalDelta = next.horizontalOffset - camConfig.horizontalOffset;
        lookTarget.y += heightDelta;
        lookTarget.x += horizontalDelta;
        Object.assign(camConfig, next);
        setBoneRotationZ('leftUpperArm', -camConfig.armAngle);
        setBoneRotationZ('rightUpperArm', camConfig.armAngle);
        applyCamera();
      },
    };
  } catch (cause) {
    renderer.dispose();
    renderer.domElement.remove();
    throw cause;
  }
}
