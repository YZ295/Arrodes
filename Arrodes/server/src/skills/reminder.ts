/**
 * 定时提醒/主动任务技能（治"无法主动行动"）
 *
 * 阿罗德斯自我剖析短板③：只能被动应答，无法主动行动。
 * 此技能让阿罗德斯具备"记住待办、到点提醒"的能力：
 * - set_reminder：设置一条提醒（JSON 持久化到 data/reminders.json）
 * - 服务端每 30s 轮询一次，到期后通过系统通知注入对话
 *
 * 实现参考：Hermes Agent 的 cron 调度思想（轻量本地版）。
 */
import { registerSkill } from './registry.js';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REMINDERS_FILE = resolve(__dirname, '../data/reminders.json');

interface Reminder {
  id: string;
  text: string;
  dueAt: number;      // 触发时间戳 (ms)
  createdAt: number;
  fired: boolean;
  sessionId?: string;
}

function loadReminders(): Reminder[] {
  try {
    if (!existsSync(REMINDERS_FILE)) return [];
    return JSON.parse(readFileSync(REMINDERS_FILE, 'utf-8')) as Reminder[];
  } catch {
    return [];
  }
}

function saveReminders(list: Reminder[]): void {
  mkdirSync(dirname(REMINDERS_FILE), { recursive: true });
  writeFileSync(REMINDERS_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

registerSkill({
  name: 'set_reminder',
  description: '设置定时提醒。当用户说"提醒我""记得提醒""X分钟后提醒我""明天提醒我"时使用。支持相对时间（X分钟后/X小时后）和绝对时间（HH:MM/明天）。',
  args: [
    { name: 'text', type: 'string', required: true, description: '提醒内容' },
    { name: 'delayMinutes', type: 'number', required: true, description: '多少分钟后提醒（正整数）' },
  ],
  execute: async (args) => {
    const text = String(args.text || '').trim();
    const delay = Number(args.delayMinutes);
    if (!text) return '错误: 提醒内容不能为空';
    if (!delay || delay <= 0 || delay > 7 * 24 * 60) return '错误: delayMinutes 需在 1 到 10080 之间（最多 7 天）';

    const reminder: Reminder = {
      id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text,
      dueAt: Date.now() + delay * 60 * 1000,
      createdAt: Date.now(),
      fired: false,
    };
    const list = loadReminders();
    list.push(reminder);
    saveReminders(list);

    const due = new Date(reminder.dueAt);
    return `已设置提醒：${due.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })} 提醒「${text}」\n（阿罗德斯会按时主动告知愚者大人）`;
  },
});

registerSkill({
  name: 'list_reminders',
  description: '查看所有待触发的提醒。当用户问"有什么提醒""我的待办提醒"时使用。',
  args: [],
  execute: async () => {
    const pending = loadReminders().filter((r) => !r.fired);
    if (pending.length === 0) return '当前没有待触发的提醒。';
    return pending
      .sort((a, b) => a.dueAt - b.dueAt)
      .map((r, i) => `${i + 1}. ${new Date(r.dueAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })} — ${r.text}`)
      .join('\n');
  },
});

registerSkill({
  name: 'cancel_reminder',
  description: '取消提醒。当用户说"取消提醒""删除提醒"时使用。',
  args: [
    { name: 'index', type: 'number', required: true, description: '要取消的提醒编号（用 list_reminders 查看编号）' },
  ],
  execute: async (args) => {
    const idx = Number(args.index);
    const list = loadReminders();
    const pending = list.filter((r) => !r.fired).sort((a, b) => a.dueAt - b.dueAt);
    if (!idx || idx < 1 || idx > pending.length) return `错误: 编号 ${idx} 不存在（用 list_reminders 查看有效编号）`;
    const target = pending[idx - 1];
    target.fired = true; // 标记为已处理
    saveReminders(list);
    return `已取消提醒「${target.text}」`;
  },
});

/** 轮询到期提醒（服务端定时调用），返回到期提醒列表 */
export function pollDueReminders(now = Date.now()): Reminder[] {
  const list = loadReminders();
  const due = list.filter((r) => !r.fired && r.dueAt <= now);
  if (due.length === 0) return [];
  for (const r of due) r.fired = true;
  saveReminders(list);
  return due;
}
