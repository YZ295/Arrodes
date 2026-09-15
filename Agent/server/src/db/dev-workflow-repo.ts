/**
 * 开发工作流仓库
 *
 * 工作区级开发流程状态机：idea → spec → tickets → implement → review → done。
 * 每个阶段有独立步骤记录（状态/产出物路径/备注），全程可追溯。
 * 支持从多 Agent 研讨会一键转入（sourceSeminarId）。
 */
import { getDb } from './connection.js';
import { randomUUID } from 'node:crypto';

export const DEV_WORKFLOW_STAGES = [
  'idea',
  'spec',
  'tickets',
  'implement',
  'review',
  'done',
] as const;

export type DevWorkflowStage = typeof DEV_WORKFLOW_STAGES[number];
export type DevStepStatus = 'pending' | 'in_progress' | 'done';

export interface DevWorkflow {
  id: string;
  workspaceId: string;
  title: string;
  projectDir: string;
  sourceSeminarId: string | null;
  stage: DevWorkflowStage;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface DevWorkflowStep {
  id: string;
  workflowId: string;
  stage: DevWorkflowStage;
  status: DevStepStatus;
  artifactPath: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface WfRow {
  id: string;
  workspace_id: string;
  title: string;
  project_dir: string;
  source_seminar_id: string | null;
  stage: DevWorkflowStage;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

interface StepRow {
  id: string;
  workflow_id: string;
  stage: DevWorkflowStage;
  status: DevStepStatus;
  artifact_path: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

function toWf(r: WfRow): DevWorkflow {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    title: r.title,
    projectDir: r.project_dir,
    sourceSeminarId: r.source_seminar_id,
    stage: r.stage,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toStep(r: StepRow): DevWorkflowStep {
  return {
    id: r.id,
    workflowId: r.workflow_id,
    stage: r.stage,
    status: r.status,
    artifactPath: r.artifact_path,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class DevWorkflowRepository {
  create(input: {
    workspaceId: string;
    title: string;
    projectDir?: string;
    sourceSeminarId?: string;
  }): DevWorkflow {
    const db = getDb();
    const now = new Date().toISOString();
    const id = randomUUID();
    db.transaction(() => {
      db.prepare(`
        INSERT INTO workspace_dev_workflows
          (id, workspace_id, title, project_dir, source_seminar_id, stage, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'idea', 'active', ?, ?)
      `).run(
        id, input.workspaceId, input.title.trim(),
        input.projectDir ?? '', input.sourceSeminarId ?? null, now, now,
      );
      db.prepare(`
        INSERT INTO workspace_dev_workflow_steps
          (id, workflow_id, stage, status, artifact_path, notes, created_at, updated_at)
        VALUES (?, ?, 'idea', 'pending', '', '', ?, ?)
      `).run(randomUUID(), id, now, now);
    })();
    return this.get(id)!;
  }

  get(id: string): DevWorkflow | null {
    const db = getDb();
    const row = db.prepare(`
      SELECT id, workspace_id, title, project_dir, source_seminar_id, stage, status, created_at, updated_at
      FROM workspace_dev_workflows WHERE id = ?
    `).get(id) as WfRow | undefined;
    return row ? toWf(row) : null;
  }

  list(workspaceId: string, limit = 50): DevWorkflow[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, workspace_id, title, project_dir, source_seminar_id, stage, status, created_at, updated_at
      FROM workspace_dev_workflows
      WHERE workspace_id = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(workspaceId, limit) as WfRow[];
    return rows.map(toWf);
  }

  steps(workflowId: string): DevWorkflowStep[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, workflow_id, stage, status, artifact_path, notes, created_at, updated_at
      FROM workspace_dev_workflow_steps
      WHERE workflow_id = ?
      ORDER BY created_at ASC
    `).all(workflowId) as StepRow[];
    return rows.map(toStep);
  }

  /**
   * 推进到下一阶段：当前阶段步骤 done（可登记产出物），下一阶段 in_progress。
   * done 阶段后再推进抛错。
   */
  advance(id: string, input: { artifactPath?: string; notes?: string }): DevWorkflow | null {
    const db = getDb();
    const cur = this.get(id);
    if (!cur) return null;
    if (cur.stage === 'done') throw new Error('工作流已完成，不能继续推进');
    const idx = DEV_WORKFLOW_STAGES.indexOf(cur.stage);
    const next = DEV_WORKFLOW_STAGES[idx + 1];
    if (!next) throw new Error('已无下一阶段');
    const now = new Date().toISOString();

    db.transaction(() => {
      // 当前阶段 → done（登记产出物）
      db.prepare(`
        UPDATE workspace_dev_workflow_steps
        SET status = 'done', artifact_path = ?, notes = ?, updated_at = ?
        WHERE workflow_id = ? AND stage = ?
      `).run(input.artifactPath ?? '', input.notes ?? '', now, id, cur.stage);

      // 下一阶段步骤：存在则 in_progress，否则创建
      const existing = db.prepare(
        'SELECT id FROM workspace_dev_workflow_steps WHERE workflow_id = ? AND stage = ?',
      ).get(id, next) as { id: string } | undefined;
      if (existing) {
        db.prepare(`
          UPDATE workspace_dev_workflow_steps SET status = 'in_progress', updated_at = ? WHERE id = ?
        `).run(now, existing.id);
      } else {
        db.prepare(`
          INSERT INTO workspace_dev_workflow_steps
            (id, workflow_id, stage, status, artifact_path, notes, created_at, updated_at)
          VALUES (?, ?, ?, 'in_progress', '', '', ?, ?)
        `).run(randomUUID(), id, next, now, now);
      }

      db.prepare(`
        UPDATE workspace_dev_workflows SET stage = ?, updated_at = ? WHERE id = ?
      `).run(next, now, id);
    })();
    return this.get(id);
  }

  updateStep(
    workflowId: string,
    stage: DevWorkflowStage,
    input: { status?: DevStepStatus; artifactPath?: string; notes?: string },
  ): DevWorkflowStep | null {
    const db = getDb();
    const row = db.prepare(
      'SELECT * FROM workspace_dev_workflow_steps WHERE workflow_id = ? AND stage = ?',
    ).get(workflowId, stage) as StepRow | undefined;
    if (!row) return null;
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE workspace_dev_workflow_steps
      SET status = ?, artifact_path = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.status ?? row.status,
      input.artifactPath ?? row.artifact_path,
      input.notes ?? row.notes,
      now,
      row.id,
    );
    const updated = db.prepare(`
      SELECT id, workflow_id, stage, status, artifact_path, notes, created_at, updated_at
      FROM workspace_dev_workflow_steps WHERE id = ?
    `).get(row.id) as StepRow | undefined;
    return updated ? toStep(updated) : null;
  }
}

export const devWorkflowRepo = new DevWorkflowRepository();
