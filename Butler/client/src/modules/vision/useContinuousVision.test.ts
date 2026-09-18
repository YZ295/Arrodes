/**
 * 观察帧排除区测试
 *
 * 背景：真机验收发现系统会读到自己的面板文字（模型 visibleText 里出现了
 * 「Blink 编译已完成」），而面板的验证文案又把期望证据的字面量嵌进了句子，
 * 于是系统读自己的「还没出现」提示判定「上一步已完成」——凭空造出进展。
 *
 * 根治手段：把阿罗德斯**所有**自有窗口都从观察帧里抹掉，而不只是桌宠。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearObservationExclusions,
  describeExclusions,
  getObservationExclusions,
  mapRectToFrame,
  resolveExclusionRects,
  setExclusionReporter,
  setObservationExclusion,
  setSelfWindowVisible,
} from './useContinuousVision';

/** 让 readSelfWindowRect 读到确定的窗口位置 */
function stubOwnWindow(rect: { x: number; y: number; width: number; height: number } | null): void {
  if (!rect) {
    vi.stubGlobal('window', {});
    return;
  }
  vi.stubGlobal('window', {
    screenX: rect.x,
    screenY: rect.y,
    outerWidth: rect.width,
    outerHeight: rect.height,
  });
}

beforeEach(() => {
  clearObservationExclusions();
  setExclusionReporter(null);
  setSelfWindowVisible(true);   // 默认保守：先当作可见，避免意外读到自家面板
});

describe('排除区登记表', () => {
  it('同时记住多个自有窗口，而不是互相覆盖', () => {
    // 桌宠窗口与主窗口/面板都会遮挡屏幕，两个都得排除
    setObservationExclusion('pet', { x: 100, y: 100, width: 440, height: 400 });
    setObservationExclusion('self', { x: 0, y: 0, width: 1200, height: 800 });

    expect(getObservationExclusions()).toHaveLength(2);
    expect(getObservationExclusions()).toContainEqual({ x: 100, y: 100, width: 440, height: 400 });
    expect(getObservationExclusions()).toContainEqual({ x: 0, y: 0, width: 1200, height: 800 });
  });

  it('重复登记同一窗口只更新，不堆积', () => {
    setObservationExclusion('pet', { x: 0, y: 0, width: 10, height: 10 });
    setObservationExclusion('pet', { x: 50, y: 50, width: 20, height: 20 });

    expect(getObservationExclusions()).toEqual([{ x: 50, y: 50, width: 20, height: 20 }]);
  });

  it('传 null 移除该窗口，不影响其他窗口', () => {
    setObservationExclusion('pet', { x: 1, y: 1, width: 2, height: 2 });
    setObservationExclusion('self', { x: 3, y: 3, width: 4, height: 4 });
    setObservationExclusion('pet', null);

    expect(getObservationExclusions()).toEqual([{ x: 3, y: 3, width: 4, height: 4 }]);
  });

  it('尺寸退化为 0 的矩形不入表，避免抹出一条无意义的带', () => {
    setObservationExclusion('self', { x: 0, y: 0, width: 0, height: 500 });
    setObservationExclusion('pet', { x: 0, y: 0, width: 500, height: 0 });

    expect(getObservationExclusions()).toEqual([]);
  });
});

describe('屏幕坐标 → 观察帧坐标', () => {
  it('按帧与屏幕的比例缩放', () => {
    // 屏幕 1920x1080 的观察帧被压到 1280x720（MAX_FRAME_WIDTH 限宽）
    const mapped = mapRectToFrame(
      { x: 960, y: 540, width: 480, height: 270 },
      1280, 720, 1920, 1080,
    );

    expect(mapped).toEqual({ rx: 640, ry: 360, rw: 320, rh: 180 });
  });

  it('完全落在画外的矩形被忽略', () => {
    const mapped = mapRectToFrame(
      { x: 3000, y: 2000, width: 100, height: 100 },
      1280, 720, 1920, 1080,
    );

    expect(mapped).toBeNull();
  });

  it('巨型窗口仍返回覆盖整个帧的矩形（宁可全遮也不漏遮）', () => {
    // 面板最大化时把整个屏幕盖住是真实场景：此时观察帧近乎纯色，
    // 会被纯色帧检查挡下——宁可停止观察，也不能让系统读到自己的界面
    const mapped = mapRectToFrame(
      { x: 0, y: 0, width: 1920, height: 1080 },
      1280, 720, 1920, 1080,
    );

    expect(mapped).toEqual({ rx: 0, ry: 0, rw: 1280, rh: 720 });
  });
});

describe('抓帧时实际抹掉哪些区域', () => {
  it('桌宠与本窗口都会被抹掉，不只是桌宠', () => {
    // 这是本轮的修复核心：只排除桌宠时，面板文字会被模型读进 visibleText
    stubOwnWindow({ x: 1000, y: 500, width: 480, height: 360 });
    setObservationExclusion('pet', { x: 1200, y: 600, width: 440, height: 400 });

    const rects = resolveExclusionRects(1280, 720, 1920, 1080);

    expect(rects).toHaveLength(2);
    // 本窗口：1000/1920*1280 = 667，500/1080*720 = 333
    expect(rects).toContainEqual({ rx: 667, ry: 333, rw: 320, rh: 240 });
    // 桌宠：1200/1920*1280 = 800，600/1080*720 = 400
    expect(rects).toContainEqual({ rx: 800, ry: 400, rw: 293, rh: 267 });
  });

  it('窗口移动后按新位置抹掉，不会漏遮', () => {
    // 浏览器没有窗口 move 事件，位置在抓帧时刷新
    stubOwnWindow({ x: 0, y: 0, width: 480, height: 360 });
    expect(resolveExclusionRects(1280, 720, 1920, 1080)).toEqual([
      { rx: 0, ry: 0, rw: 320, rh: 240 },
    ]);

    stubOwnWindow({ x: 960, y: 540, width: 480, height: 360 });
    expect(resolveExclusionRects(1280, 720, 1920, 1080)).toEqual([
      { rx: 640, ry: 360, rw: 320, rh: 240 },
    ]);
  });

  it('读取不到窗口尺寸时不登记，不误抹整帧', () => {
    stubOwnWindow(null);

    expect(resolveExclusionRects(1280, 720, 1920, 1080)).toEqual([]);
  });
});

describe('诊断上报（让「遮罩有没有生效」可观测）', () => {
  it('报告谁被登记、谁真的被抹掉、谁被跳过', () => {
    stubOwnWindow({ x: 1000, y: 500, width: 480, height: 360 });
    setObservationExclusion('pet', { x: 1200, y: 600, width: 440, height: 400 });
    // 落在画外的窗口：登记了但遮不到，必须能被看出来
    setObservationExclusion('offscreen', { x: 5000, y: 5000, width: 100, height: 100 });

    const report = describeExclusions(1280, 720, 1920, 1080);

    expect([...report.registered].sort()).toEqual(['offscreen', 'pet', 'self']);
    expect(report.masked).toHaveLength(2);
    expect(report.skipped).toEqual(['offscreen']);
    expect(report).toMatchObject({ screenWidth: 1920, screenHeight: 1080, frameWidth: 1280, frameHeight: 720 });
  });

  it('只有一个窗口都没遮住时也要如实报告，不能静默', () => {
    // 这正是需要被看见的故障态：面板在屏幕上，但排除区一个都没生效
    stubOwnWindow(null);

    const report = describeExclusions(1280, 720, 1920, 1080);

    expect(report.masked).toEqual([]);
    expect(report.registered).toEqual([]);
  });

  it('排除区变化时上报一次，重复的抓帧不刷屏', () => {
    const reporter = vi.fn();
    setExclusionReporter(reporter);
    stubOwnWindow({ x: 0, y: 0, width: 480, height: 360 });

    describeExclusions(1280, 720, 1920, 1080);
    describeExclusions(1280, 720, 1920, 1080);
    describeExclusions(1280, 720, 1920, 1080);
    expect(reporter).toHaveBeenCalledTimes(1);

    // 桌宠窗口出现 → 排除区变了 → 必须再报一次
    setObservationExclusion('pet', { x: 1200, y: 600, width: 440, height: 400 });
    describeExclusions(1280, 720, 1920, 1080);
    expect(reporter).toHaveBeenCalledTimes(2);
    expect(reporter.mock.calls[1][0].registered).toContain('pet');
  });

  it('上报的是给人看的内容，不含任何会被当成屏幕证据的字面量', () => {
    const reporter = vi.fn();
    setExclusionReporter(reporter);
    stubOwnWindow({ x: 100, y: 100, width: 200, height: 200 });

    describeExclusions(1280, 720, 1920, 1080);

    const payload = JSON.stringify(reporter.mock.calls[0][0]);
    expect(payload).not.toMatch(/Done (compiling|uploading)/i);
    expect(payload).not.toMatch(/[一-龥]/);
  });

  it('重新接线时把上次的去重状态清掉，第一帧就会上报', () => {
    const first = vi.fn();
    setExclusionReporter(first);
    stubOwnWindow({ x: 0, y: 0, width: 480, height: 360 });
    describeExclusions(1280, 720, 1920, 1080);
    expect(first).toHaveBeenCalledTimes(1);

    const second = vi.fn();
    setExclusionReporter(second);
    describeExclusions(1280, 720, 1920, 1080);
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('隐藏的观察者窗口不该挤占观察区域', () => {
  it('窗口不可见时不登记自己，避免白遮一大块屏幕', () => {
    // 真机实测的回归：--pet 下管家窗口 show:false，但渲染进程照样能读到它的
    // outerWidth/outerHeight（860x720），于是白遮掉屏幕约 30% 的面积，
    // 把「遮挡导致没识别」的问题反而放大了。
    stubOwnWindow({ x: 529, y: 156, width: 860, height: 720 });
    setSelfWindowVisible(false);

    const report = describeExclusions(1280, 720, 1920, 1080);

    expect(report.registered).not.toContain('self');
    expect(report.masked).toEqual([]);
    expect(report.skipped).toEqual([]);
    expect(report.selfVisible).toBe(false);
  });

  it('窗口可见时仍然排除自己，防止读到自家面板', () => {
    stubOwnWindow({ x: 0, y: 0, width: 480, height: 360 });
    setSelfWindowVisible(true);

    const report = describeExclusions(1280, 720, 1920, 1080);

    expect(report.registered).toContain('self');
    expect(report.masked).toEqual([{ rx: 0, ry: 0, rw: 320, rh: 240 }]);
  });

  it('可见性变化后立刻反映到下一帧，不必重启观察', () => {
    stubOwnWindow({ x: 0, y: 0, width: 480, height: 360 });
    setSelfWindowVisible(false);
    expect(describeExclusions(1280, 720, 1920, 1080).masked).toEqual([]);

    setSelfWindowVisible(true);
    expect(describeExclusions(1280, 720, 1920, 1080).masked).toHaveLength(1);

    setSelfWindowVisible(false);
    expect(describeExclusions(1280, 720, 1920, 1080).masked).toEqual([]);
  });

  it('可见时不影响桌宠窗口的排除', () => {
    stubOwnWindow({ x: 0, y: 0, width: 480, height: 360 });
    setSelfWindowVisible(true);
    setObservationExclusion('pet', { x: 1200, y: 600, width: 440, height: 400 });

    const report = describeExclusions(1280, 720, 1920, 1080);

    expect([...report.registered].sort()).toEqual(['pet', 'self']);
    expect(report.masked).toHaveLength(2);
  });
});
