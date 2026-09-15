/**
 * 最小屏幕任务闭环测试
 *
 * 覆盖验收关键点：
 *   - 用户明确开始 / 停止任务；停止后不再观察
 *   - 每轮只给一个下一步，并留下可验证的期望证据
 *   - 下一轮对照期望证据，判定上一步成功 / 失败 / 待定
 *   - 等待轮次不产生"上一步"，避免把等待当成进展
 *   - 证据比对保守可解释，不做语义猜测
 */
import { describe, expect, it } from 'vitest';
import {
  applyTaskObservation,
  createTaskSession,
  evidenceMatches,
  startTask,
  stopTask,
  type ObservableFrame,
} from './taskSession';

const frame = (over: Partial<ObservableFrame> = {}): ObservableFrame => ({
  description: 'Arduino IDE 画面',
  visibleText: [],
  ...over,
});

describe('任务会话：开始与停止', () => {
  it('新建会话是未激活的', () => {
    const s = createTaskSession('编译 Blink');
    expect(s.active).toBe(false);
    expect(s.phase).toBe('idle');
  });

  it('开始任务后进入观察态并带上目标', () => {
    const s = startTask(createTaskSession('编译 Blink'));
    expect(s.active).toBe(true);
    expect(s.phase).toBe('observing');
    expect(s.goal).toBe('编译 Blink');
  });

  it('停止任务后不再接受观察（不截图也不推理）', () => {
    const running = startTask(createTaskSession('编译 Blink'));
    const stopped = stopTask(running);
    expect(stopped.active).toBe(false);
    expect(stopped.phase).toBe('idle');
    expect(stopped.nextAction).toBeNull();
    expect(stopped.pendingEvidence).toEqual([]);

    const after = applyTaskObservation(stopped, frame({ visibleText: ['Done compiling.'] }));
    expect(after.observationCount).toBe(0);
    expect(after.state).toBeNull();
  });
});

describe('闭环：下一步与期望证据', () => {
  it('第一次观察没有上一步可验证', () => {
    const next = applyTaskObservation(
      startTask(createTaskSession('编译 Blink')),
      frame({
        decision: 'advance',
        currentStep: 'Blink 编译已完成',
        nextAction: '点击上传按钮，将 Blink 写入当前选择的 Arduino 开发板。',
        expectedEvidence: ['Done uploading.'],
      }),
    );
    expect(next.verification.result).toBe('none');
    expect(next.verification.basis).toContain('第一次观察');
    expect(next.state).toBe('Blink 编译已完成');
    expect(next.nextAction).toContain('点击上传按钮');
    expect(next.pendingEvidence).toEqual(['Done uploading.']);
    expect(next.phase).toBe('advancing');
  });

  it('下一轮出现期望证据时判定上一步成功，并接续新期望', () => {
    const r1 = applyTaskObservation(
      startTask(createTaskSession('编译 Blink')),
      frame({
        decision: 'advance',
        nextAction: '点击上传按钮',
        expectedEvidence: ['Done uploading.'],
      }),
    );

    const r2 = applyTaskObservation(
      r1,
      frame({
        decision: 'advance',
        visibleText: ['Done uploading.', 'avrdude done. Thank you.'],
        currentStep: 'Blink 已上传到开发板',
        nextAction: '屏幕侧上传已完成；下一阶段再用摄像头验证板载 LED。',
        expectedEvidence: ['摄像头画面中板载 LED 每秒亮灭一次'],
      }),
    );

    expect(r2.verification.result).toBe('confirmed');
    expect(r2.verification.basis).toContain('上一步已完成');
    expect(r2.pendingEvidence).toEqual(['摄像头画面中板载 LED 每秒亮灭一次']);
  });

  it('编译失败时判定上一步未成功，并给出修正方向', () => {
    const r1 = applyTaskObservation(
      startTask(createTaskSession('编译 Blink')),
      frame({
        decision: 'advance',
        nextAction: '点击上传按钮',
        expectedEvidence: ['Done uploading.'],
      }),
    );

    const r2 = applyTaskObservation(
      r1,
      frame({
        decision: 'blocked',
        visibleText: ['exit status 1', "expected ';' before '}' token"],
        currentStep: '编译失败',
        nextAction: '先查看输出面板中的第一条 error，并修正代码后重新编译。',
        expectedEvidence: ['Done compiling.'],
      }),
    );

    expect(r2.verification.result).toBe('failed');
    expect(r2.verification.basis).toContain('需要处理的错误');
    expect(r2.phase).toBe('blocked');
    expect(r2.nextAction).toContain('修正代码');
  });

  it('等待轮次不产生"上一步"，避免把等待当成进展', () => {
    const waiting = applyTaskObservation(
      startTask(createTaskSession('编译 Blink')),
      frame({
        decision: 'wait',
        currentState: '等待 Arduino IDE 输出',
        expectedEvidence: ['Done compiling. 或第一条编译错误'],
      }),
    );
    expect(waiting.pendingEvidence).toEqual([]);
    expect(waiting.phase).toBe('waiting-evidence');

    const again = applyTaskObservation(waiting, frame({ decision: 'wait', visibleText: ['正在编译'] }));
    expect(again.verification.result).toBe('none');
  });
});

describe('证据比对：保守且可解释', () => {
  it('忽略大小写与尾部标点', () => {
    expect(evidenceMatches('Done compiling.', ['Done compiling'])).toBe(true);
    expect(evidenceMatches('done compiling', ['编译输出：Done compiling.'])).toBe(true);
  });

  it('过短的期望文本不参与匹配，避免误判', () => {
    expect(evidenceMatches('ok', ['ok'])).toBe(false);
  });

  it('未出现即不匹配', () => {
    expect(evidenceMatches('Done uploading.', ['Compiling...'])).toBe(false);
  });
});
