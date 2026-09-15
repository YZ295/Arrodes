/**
 * Obsidian 长期记忆：文件格式、同步与读回
 *
 * **权威方向：Obsidian → SQLite。** 本目录是长期记忆的唯一权威，
 * SQLite 侧的 `workspace_memories` 只是可从本目录重建的索引。
 *
 * 格式约定（每条记忆一个 Markdown 笔记）：
 *   frontmatter 携带 id / type / scope / source / status，供读回时还原索引；
 *   正文分两区：
 *     <!-- arrodes:auto:start --> … <!-- arrodes:auto:end -->   自动生成区，同步时重写
 *     其余内容                                                  用户正文区，永不被覆盖
 *
 * 失效处理：`rejected` 或已不在确认集合的笔记移入 `_archive-rejected/`（可恢复），
 * 绝不物理删除；`.arrodes-manifest.json` 记录本工具生成过的文件，避免误动用户自己的笔记。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { WorkspaceMemory } from '../workspace/memory-hub.js';

/** 自动生成区标记（同步只改这一段） */
export const AUTO_START = '<!-- arrodes:auto:start -->';
export const AUTO_END = '<!-- arrodes:auto:end -->';

const MANIFEST_FILE = '.arrodes-manifest.json';
const ARCHIVE_DIR = '_archive-rejected';
const INDEX_FILE = '00-工作区记忆索引.md';
const NOTE_PREFIX = '工作区记忆-';

/**
 * 记忆库根目录（用户既有知识库，可用 OBSIDIAN_VAULT 覆盖）。
 * 目录名为历史命名，与任何外部智能体无关；阿罗德斯记忆固定落在其下的独立子目录。
 */
export function defaultVaultPath(): string {
  return process.env.OBSIDIAN_VAULT || 'E:\\project\\HermesProject\\Obsidian';
}

export function memoryDir(vaultPath: string): string {
  return resolve(vaultPath, 'Knowledge', '知识库', 'workspace-memories');
}

function slugify(id: string): string {
  return id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 12);
}

/** 笔记文件名（导出以便测试与外部工具对齐命名规则） */
export function noteFileName(id: string): string {
  return `${NOTE_PREFIX}${slugify(id)}.md`;
}

// ===== 渲染 =====

export function renderMemoryNote(memory: WorkspaceMemory, userBody = ''): string {
  const title = `${NOTE_PREFIX}${slugify(memory.id)}`;
  const now = new Date().toISOString();
  const front = [
    '---',
    `id: ${memory.id}`,
    `title: ${title}`,
    `created: ${memory.createdAt}`,
    `updated: ${now}`,
    `type: ${memory.type}`,
    `status: ${memory.status ?? 'confirmed'}`,
    `scope: ${memory.scope ?? 'project'}`,
    `sourceAgent: ${memory.sourceAgent}`,
    `workspaceId: ${memory.workspaceId ?? 'default'}`,
    ...(memory.evidence ? [`evidence: ${String(memory.evidence).replace(/\s+/g, ' ').slice(0, 200)}`] : []),
    `tags: [arrodes-memory, ${memory.sourceAgent}]`,
    '---',
  ];
  const auto = [
    AUTO_START,
    `# 工作区记忆 · ${memory.sourceAgent}`,
    '',
    memory.content,
    '',
    `- 来源：[[${memory.sourceAgent}]]`,
    `- 索引：[[00-工作区记忆索引]]`,
    `- 类型 / 状态：${memory.type} / ${memory.status ?? 'confirmed'}`,
    AUTO_END,
  ];
  const tail = userBody.trim()
    ? ['', '## 我的补充（阿罗德斯不会覆盖这里）', '', userBody.trim(), '']
    : [''];
  return [...front, '', ...auto, ...tail].join('\n');
}

export function renderMemoryIndex(memories: WorkspaceMemory[]): string {
  const now = new Date().toISOString();
  const lines = memories.map((m) => {
    const title = `${NOTE_PREFIX}${slugify(m.id)}`;
    const preview = m.content.replace(/\s+/g, ' ').slice(0, 60);
    return `- [[${title}|${title}]] — ${preview}（${m.sourceAgent}）`;
  });
  return [
    '---',
    'title: 00-工作区记忆索引',
    `created: ${now}`,
    `updated: ${now}`,
    'type: index',
    'tags: [arrodes-memory, index]',
    '---',
    '',
    '# 工作区记忆索引',
    '',
    '> 本目录是阿罗德斯长期记忆的**权威来源**；SQLite 侧只是可从本目录重建的索引。',
    '> 每条笔记的自动生成区由同步重写，「我的补充」区不会被覆盖。',
    '',
    '## 已确认记忆清单',
    '',
    ...(lines.length > 0 ? lines : ['（暂无已确认记忆）']),
    '',
  ].join('\n');
}

// ===== 解析（读回）=====

/** 取出笔记里的用户正文区（自动区与 frontmatter 之外的内容） */
export function extractUserBody(markdown: string): string {
  if (!markdown) return '';
  let rest = markdown;
  const s = markdown.indexOf(AUTO_START);
  const e = markdown.indexOf(AUTO_END);
  if (s !== -1 && e > s) {
    rest = markdown.slice(0, s) + markdown.slice(e + AUTO_END.length);
  }
  const fm = rest.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (fm) rest = rest.slice(fm[0].length);
  return rest
    .split('\n')
    .filter((line) => !/^#\s/.test(line) && !line.includes('阿罗德斯不会覆盖'))
    .join('\n')
    .trim();
}

export interface ParsedMemoryNote {
  id: string;
  content: string;
  type: string;
  status: string;
  scope: string;
  sourceAgent: string;
  evidence: string;
  createdAt: string;
  file: string;
}

/** 解析单条笔记（frontmatter + 自动区内容） */
export function parseMemoryNote(
  markdown: string,
  file = '',
): ParsedMemoryNote | null {
  if (!markdown) return null;
  const fm = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const meta: Record<string, string> = {};
  for (const line of fm[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  if (!meta.id) return null;

  let content = '';
  const s = markdown.indexOf(AUTO_START);
  const e = markdown.indexOf(AUTO_END);
  if (s !== -1 && e > s) {
    content = markdown
      .slice(s + AUTO_START.length, e)
      .split('\n')
      .filter((l) => !/^#/.test(l) && !/^- /.test(l) && !l.includes('<!--'))
      .join('\n')
      .trim();
  }

  return {
    id: meta.id,
    content,
    type: meta.type || 'note',
    status: meta.status || 'confirmed',
    scope: meta.scope || 'project',
    sourceAgent: meta.sourceAgent || 'unknown',
    evidence: meta.evidence || '',
    createdAt: meta.created || new Date().toISOString(),
    file,
  };
}

/** 读取记忆目录下全部阿罗德斯笔记（不含索引与归档） */
export function readMemoryNotes(vaultPath: string = defaultVaultPath()): ParsedMemoryNote[] {
  const dir = memoryDir(vaultPath);
  if (!existsSync(dir)) return [];
  const out: ParsedMemoryNote[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md') || f === INDEX_FILE || !f.startsWith(NOTE_PREFIX)) continue;
    try {
      const parsed = parseMemoryNote(readFileSync(join(dir, f), 'utf-8'), f);
      if (parsed) out.push(parsed);
    } catch {
      // 单文件解析失败不影响其它
    }
  }
  return out;
}

// ===== manifest =====

interface Manifest {
  files: string[];
  updatedAt: string;
}

function manifestPath(dir: string): string {
  return join(dir, MANIFEST_FILE);
}

function loadManifest(dir: string): Manifest {
  const p = manifestPath(dir);
  if (!existsSync(p)) {
    // 首次运行：把目录下符合命名约定的文件视为历史生成物，一并接管
    const seed = existsSync(dir)
      ? readdirSync(dir).filter((f) => f.startsWith(NOTE_PREFIX) && f.endsWith('.md'))
      : [];
    return { files: seed, updatedAt: '' };
  }
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as Partial<Manifest>;
    return {
      files: Array.isArray(raw.files) ? raw.files.map(String) : [],
      updatedAt: raw.updatedAt ?? '',
    };
  } catch {
    return { files: [], updatedAt: '' };
  }
}

function saveManifest(dir: string, files: string[]): void {
  writeFileSync(
    manifestPath(dir),
    JSON.stringify({ files: [...files].sort(), updatedAt: new Date().toISOString() }, null, 2),
    'utf-8',
  );
}

// ===== 同步（写盘）=====

/**
 * 把「已确认」记忆写入 Obsidian。
 * - 已存在同名笔记：只重写自动生成区，保留用户正文
 * - 之前生成过、本次不在集合里的笔记：移入 `_archive-rejected/`
 */
export function writeMemoryNotes(
  vaultPath: string,
  memories: WorkspaceMemory[],
): { count: number; dir: string; archived: string[] } {
  const dir = memoryDir(vaultPath);
  mkdirSync(dir, { recursive: true });

  const manifest = loadManifest(dir);
  const known = new Set(manifest.files);
  const current = new Set<string>();

  for (const memory of memories) {
    const file = noteFileName(memory.id);
    const path = join(dir, file);
    const prev = existsSync(path) ? readFileSync(path, 'utf-8') : '';
    writeFileSync(path, renderMemoryNote(memory, extractUserBody(prev)), 'utf-8');
    known.add(file);
    current.add(file);
  }

  writeFileSync(join(dir, INDEX_FILE), renderMemoryIndex(memories), 'utf-8');
  known.add(INDEX_FILE);
  current.add(INDEX_FILE);

  // 归档失效笔记（不物理删除）
  const archived: string[] = [];
  const archiveDir = join(dir, ARCHIVE_DIR);
  for (const file of [...known]) {
    if (current.has(file)) continue;
    const from = join(dir, file);
    if (!existsSync(from)) {
      known.delete(file);
      continue;
    }
    try {
      mkdirSync(archiveDir, { recursive: true });
      renameSync(from, join(archiveDir, `${Date.now()}-${file}`));
      archived.push(file);
      known.delete(file);
    } catch {
      // 归档失败保留原地，下次同步重试
    }
  }

  saveManifest(dir, [...known]);
  return { count: memories.length, dir, archived };
}

/**
 * 从「已确认」记忆同步到 Obsidian。
 * 调用方需先过滤 status='confirmed'（见 memoryService.syncToObsidian）。
 */
export function syncWorkspaceMemoriesToObsidian(
  memories: WorkspaceMemory[],
  vaultPath: string = defaultVaultPath(),
): { count: number; dir: string; archived: string[] } {
  return writeMemoryNotes(vaultPath, memories);
}
