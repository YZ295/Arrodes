/**
 * memoryService 关键不变量测试
 *
 * 这些是记忆架构的「宪法」——实现细节可变，这几条不能破：
 *   1. 外部来源写入一律降级为候选，不能靠自报 source='user' 绕过审核
 *   2. 候选不得进入任何模型上下文（召回 / 上下文包）
 *   3. 拒绝或遗忘之后：候选队列、召回、同步三处一致
 *   4. 用户在 Obsidian 的编辑不会被同步静默覆盖
 *   5. 索引可从 Obsidian 重建（Obsidian 才是权威）
 *   6. 私人（scope=user）记忆默认不外发
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { closeDb, setDbPathForTests } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import {
  submitMemory,
  confirmMemory,
  rejectMemory,
  listConfirmedMemories,
  recallMemories,
  recallByKeywords,
  rememberForUser,
  forgetForUser,
  buildContextPack,
  syncMemoriesToObsidian,
  importFromObsidian,
} from './memoryService.js';
import { extractUserBody, memoryDir, noteFileName } from './obsidianMemory.js';

const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'arrodes-memsvc-'));

beforeEach(() => {
  closeDb();
  setDbPathForTests(':memory:');
  initSchema();
  const dir = memoryDir(vault);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(vault, { recursive: true, force: true });
});

describe('不变量 1：外部来源只能提交候选', () => {
  it('普通外部来源写入为 candidate', () => {
    const rec = submitMemory({ content: '外部结论', source: 'codex' });
    expect(rec.status).toBe('candidate');
  });

  it('外部来源即便声明 autoConfirm 也被降级为候选', () => {
    const rec = submitMemory({ content: '试图直接确认', source: 'dsh', autoConfirm: true });
    expect(rec.status).toBe('candidate');
  });

  it('受信任来源（user）的显式写入可直接确认', () => {
    const rec = submitMemory({ content: '用户偏好深色主题', source: 'user', autoConfirm: true });
    expect(rec.status).toBe('confirmed');
  });
});

describe('不变量 2：候选不得进入任何模型上下文', () => {
  it('候选不出现在 recall / recallByKeywords / buildContextPack', () => {
    submitMemory({ content: '候选秘密甲', source: 'codex' });
    expect(recallMemories('候选秘密甲')).toHaveLength(0);
    expect(recallByKeywords(['候选秘密甲'])).toHaveLength(0);
    expect(buildContextPack({ query: '候选秘密甲' })).toHaveLength(0);
  });

  it('确认之后才进入上下文', () => {
    const rec = submitMemory({ content: '已确认结论乙', source: 'codex' });
    confirmMemory(rec.id);
    expect(recallMemories('已确认结论乙')).toHaveLength(1);
    expect(buildContextPack({ query: '已确认结论乙' })).toHaveLength(1);
  });
});

describe('不变量 3：拒绝 / 遗忘后状态一致', () => {
  it('reject 之后退出召回与上下文', () => {
    const rec = submitMemory({ content: '将被拒绝丙', source: 'codex' });
    confirmMemory(rec.id);
    expect(recallMemories('将被拒绝丙')).toHaveLength(1);
    rejectMemory(rec.id);
    expect(recallMemories('将被拒绝丙')).toHaveLength(0);
  });

  it('forget 把匹配记忆标记为 rejected 并退出召回', () => {
    rememberForUser('用户想忘掉的丁事');
    expect(recallMemories('丁事')).toHaveLength(1);
    const { forgotten } = forgetForUser('丁事');
    expect(forgotten).toBe(1);
    expect(recallMemories('丁事')).toHaveLength(0);
    expect(listConfirmedMemories()).toHaveLength(0);
  });

  it('同步只写 confirmed；失效笔记移入归档而非删除', () => {
    const rec = submitMemory({ content: '待归档戊', source: 'user', autoConfirm: true });
    syncMemoriesToObsidian('default', vault);
    const dir = memoryDir(vault);
    const file = noteFileName(rec.id);
    expect(fs.existsSync(path.join(dir, file))).toBe(true);

    rejectMemory(rec.id);
    const result = syncMemoriesToObsidian('default', vault);
    expect(result.archived).toContain(file);
    expect(fs.existsSync(path.join(dir, file))).toBe(false);
    const archived = fs.readdirSync(path.join(dir, '_archive-rejected'));
    expect(archived.some((f) => f.includes(file))).toBe(true);
  });
});

describe('不变量 4：Obsidian 人工编辑不被静默覆盖', () => {
  it('用户正文区在再次同步后保留，自动区仍然更新', () => {
    const rec = rememberForUser('用户偏好浅色主题');
    syncMemoriesToObsidian('default', vault);
    const file = path.join(memoryDir(vault), noteFileName(rec.id));

    const original = fs.readFileSync(file, 'utf-8');
    fs.writeFileSync(
      file,
      `${original}\n## 我的补充（阿罗德斯不会覆盖这里）\n\n这是我手写的重要备注。\n`,
      'utf-8',
    );

    syncMemoriesToObsidian('default', vault);

    const after = fs.readFileSync(file, 'utf-8');
    expect(after).toContain('这是我手写的重要备注。');
    expect(extractUserBody(after)).toContain('这是我手写的重要备注。');
    expect(after).toContain('用户偏好浅色主题');
  });
});

describe('不变量 5：索引可从 Obsidian 重建', () => {
  it('清空索引后可从笔记读回', () => {
    const rec = rememberForUser('可重建的事实己');
    syncMemoriesToObsidian('default', vault);

    // 模拟 SQLite 索引丢失
    closeDb();
    setDbPathForTests(':memory:');
    initSchema();
    expect(listConfirmedMemories()).toHaveLength(0);

    const result = importFromObsidian(vault);
    expect(result.imported).toBe(1);
    const rebuilt = recallMemories('可重建的事实己');
    expect(rebuilt).toHaveLength(1);
    expect(rebuilt[0].id).toBe(rec.id);
  });

  it('在 Obsidian 改动内容后重建，以 Obsidian 为准', () => {
    const rec = rememberForUser('原始内容庚');
    syncMemoriesToObsidian('default', vault);
    const file = path.join(memoryDir(vault), noteFileName(rec.id));

    const text = fs.readFileSync(file, 'utf-8').replace('原始内容庚', '改过的内容庚');
    fs.writeFileSync(file, text, 'utf-8');

    const result = importFromObsidian(vault);
    expect(result.updated).toBe(1);
    expect(recallMemories('改过的内容庚')).toHaveLength(1);
    expect(recallMemories('原始内容庚')).toHaveLength(0);
  });
});

describe('不变量 6：私人记忆默认不外发', () => {
  it('scope=user 的记忆不出现在默认上下文包中', () => {
    submitMemory({ content: '私人偏好辛', source: 'user', scope: 'user', autoConfirm: true });
    expect(buildContextPack({ query: '私人偏好辛' })).toHaveLength(0);
    expect(buildContextPack({ query: '私人偏好辛', includeUserScope: true })).toHaveLength(1);
  });
});
