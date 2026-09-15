/**
 * T8 粒子光环：球体后方的自研 WebGL1 粒子层（小视口 ~1200 粒子）
 *
 * 设计约束（源自需求文档 §3.5）：
 * - 原生 WebGL1 零依赖；状态由 auraDance 纯函数驱动（uniform 传参，单 shader）
 * - 30fps 封顶；document.hidden 暂停渲染循环；prefers-reduced-motion → 不启动（回退纯球体）
 * - 无 WebGL 环境优雅降级为 no-op（不抛错）
 * - 法律约束：技法参考 Terse-AI terse-field 公开思路（点精灵/编舞/降级），实现原创，未搬运源码
 */
import { computeAuraFrame, selectAuraDance, type AuraInput } from './auraDance';

export interface AuraController {
  setState(input: AuraInput): void;
  destroy(): void;
}

const PARTICLE_COUNT = 1200;
const FRAME_MS = 1000 / 30;
const DPR_CAP = 1.5;

const VERT_SRC = `
attribute float a_angle;
attribute float a_seed;
uniform float u_time;
uniform float u_intensity;
uniform float u_speed;
uniform float u_ringPhase;
uniform float u_aspect;
varying float v_alpha;
void main() {
  float wobble = sin(u_time * (0.6 + a_seed * 1.7) + a_seed * 6.2831);
  float radius = 0.60 + 0.10 * wobble * u_intensity + u_ringPhase * 0.22;
  float dir = mix(-1.0, 1.0, step(0.5, a_seed));
  float angle = a_angle + u_time * 0.08 * u_speed * dir;
  vec2 ring = vec2(cos(angle), sin(angle)) * radius;
  gl_Position = vec4(ring.x * u_aspect, ring.y, 0.0, 1.0);
  gl_PointSize = (2.0 + 3.0 * a_seed) * (0.8 + 0.6 * u_intensity);
  v_alpha = u_intensity * (0.30 + 0.60 * a_seed);
}
`;

const FRAG_SRC = `
precision mediump float;
uniform vec3 u_color;
varying float v_alpha;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float a = smoothstep(0.5, 0.0, length(d)) * v_alpha;
  gl_FragColor = vec4(u_color * a, a);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[ParticleAura] shader 编译失败:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function mountAura(canvas: HTMLCanvasElement): AuraController {
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = reduced
    ? null
    : (canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true }) as WebGLRenderingContext | null);
  if (!gl) return { setState() {}, destroy() {} }; // 优雅降级：回退纯球体

  const vert = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  const program = vert && frag ? gl.createProgram() : null;
  if (!program || !vert || !frag) {
    return { setState() {}, destroy() {} };
  }
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[ParticleAura] program 链接失败:', gl.getProgramInfoLog(program));
    return { setState() {}, destroy() {} };
  }
  gl.useProgram(program);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  // 环形粒子分布
  const angles = new Float32Array(PARTICLE_COUNT);
  const seeds = new Float32Array(PARTICLE_COUNT);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    angles[i] = (i / PARTICLE_COUNT) * Math.PI * 2;
    seeds[i] = Math.random();
  }
  const bindAttr = (name: string, data: Float32Array) => {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 1, gl.FLOAT, false, 0, 0);
  };
  bindAttr('a_angle', angles);
  bindAttr('a_seed', seeds);

  const u = {
    time: gl.getUniformLocation(program, 'u_time'),
    intensity: gl.getUniformLocation(program, 'u_intensity'),
    speed: gl.getUniformLocation(program, 'u_speed'),
    ringPhase: gl.getUniformLocation(program, 'u_ringPhase'),
    aspect: gl.getUniformLocation(program, 'u_aspect'),
    color: gl.getUniformLocation(program, 'u_color'),
  };

  let input: AuraInput = { voice: 'ambient', observing: false };
  let disposed = false;
  let raf = 0;
  let lastDraw = -1;

  const syncSize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    return h / w;
  };

  const draw = (now: number) => {
    const aspect = syncSize();
    const frame = computeAuraFrame(selectAuraDance(input), now);
    gl!.clear(gl.COLOR_BUFFER_BIT);
    gl!.uniform1f(u.time, now / 1000);
    gl!.uniform1f(u.intensity, frame.intensity);
    gl!.uniform1f(u.speed, frame.speed);
    gl!.uniform1f(u.ringPhase, frame.ringPhase);
    gl!.uniform1f(u.aspect, aspect);
    gl!.uniform3f(u.color, frame.color[0], frame.color[1], frame.color[2]);
    gl!.drawArrays(gl!.POINTS, 0, PARTICLE_COUNT);
  };

  const renderLoop = (now: number) => {
    raf = 0;
    if (disposed) return;
    if (!document.hidden && (lastDraw < 0 || now - lastDraw >= FRAME_MS)) {
      lastDraw = now;
      draw(now);
    }
    raf = requestAnimationFrame(renderLoop);
  };

  const onVisibility = () => {
    // 回到前台时 rAF 若已被浏览器清掉，重建循环（hidden 检查在循环内兜底）
    if (!document.hidden && !disposed && !raf) raf = requestAnimationFrame(renderLoop);
  };
  document.addEventListener('visibilitychange', onVisibility);
  raf = requestAnimationFrame(renderLoop);

  return {
    setState(next: AuraInput) {
      input = { voice: next.voice, observing: next.observing };
    },
    destroy() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      document.removeEventListener('visibilitychange', onVisibility);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
