import { describe, it, expect, beforeEach } from 'vitest';
import { closeDb, setDbPathForTests } from './connection.js';
import { initSchema } from './schema.js';
import { DevWorkflowRepository } from './dev-workflow-repo.js';
import { workspaceRepo } from './workspace-repo.js';

const repo = new DevWorkflowRepository();

describe('DevWorkflowRepository（开发工作流状态机）', () => {
  beforeEach(() => {
    closeDb();
    setDbPathForTests(':memory:');
    initSchema();
  });

  function makeWs(name = 'ws') {
    return workspaceRepo.create({ name });
  }

  it('创建工作流：初始 stage=idea，idea 步骤存在', () => {
    const ws = makeWs();
    const wf = repo.create({
      workspaceId: ws.id,
      title: '登录页深色主题',
      projectDir: 'E:/x',
    });
    expect(wf.stage).toBe('idea');
    expect(wf.status).toBe('active');
    const steps = repo.steps(wf.id);
    expect(steps).toHaveLength(1);
    expect(steps[0].stage).toBe('idea');
    expect(steps[0].status).toBe('pending');
  });

  it('按序推进：idea→done、spec→in_progress；done 后拒绝', () => {
    const ws = makeWs();
    const wf = repo.create({ workspaceId: ws.id, title: 'x' });

    const advanced = repo.advance(wf.id, { artifactPath: 'Plan/business-spec.md' });
    expect(advanced?.stage).toBe('spec');

    const steps = repo.steps(wf.id);
    const idea = steps.find((s) => s.stage === 'idea');
    const spec = steps.find((s) => s.stage === 'spec');
    expect(idea?.status).toBe('done');
    expect(idea?.artifactPath).toBe('Plan/business-spec.md');
    expect(spec?.status).toBe('in_progress');

    // 快进到 done
    for (const _ of ['spec', 'tickets', 'implement', 'review']) {
      repo.advance(wf.id, {});
    }
    expect(repo.get(wf.id)?.stage).toBe('done');
    expect(() => repo.advance(wf.id, {})).toThrow(/已完成|done/i);
  });

  it('步骤登记：更新状态/产出/备注', () => {
    const ws = makeWs();
    const wf = repo.create({ workspaceId: ws.id, title: 'x' });
    repo.advance(wf.id, {});

    repo.updateStep(wf.id, 'spec', {
      status: 'done',
      artifactPath: 'Plan/business-spec.md',
      notes: '6 章节齐全',
    });
    const spec = repo.steps(wf.id).find((s) => s.stage === 'spec');
    expect(spec?.status).toBe('done');
    expect(spec?.artifactPath).toBe('Plan/business-spec.md');
    expect(spec?.notes).toBe('6 章节齐全');
  });

  it('按工作区隔离', () => {
    const wsA = makeWs('A');
    const wsB = makeWs('B');
    repo.create({ workspaceId: wsA.id, title: 'A 的流程' });
    repo.create({ workspaceId: wsB.id, title: 'B 的流程' });
    expect(repo.list(wsA.id)).toHaveLength(1);
    expect(repo.list(wsA.id)[0].title).toBe('A 的流程');
    expect(repo.list(wsB.id)).toHaveLength(1);
  });

  it('支持来源研讨会关联', () => {
    const ws = makeWs();
    const wf = repo.create({
      workspaceId: ws.id,
      title: '从研讨会转入',
      sourceSeminarId: 'sem-1',
    });
    expect(repo.get(wf.id)?.sourceSeminarId).toBe('sem-1');
  });
});
