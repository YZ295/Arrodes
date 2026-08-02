/**
 * 内置技能
 *
 * 第一性原理：每个技能必须有可执行的后端能力支撑，不做空壳。
 */
import { registerSkill } from './registry.js';
import { MemoryRepository } from '../db/memory-repo.js';
import { SessionRepository } from '../db/session-repo.js';
import { loadProfile } from '../services/MemoryGateway.js';
import { config } from '../config.js';
import { initModelRegistry } from '../services/modelRegistry.js';

/** 记忆搜索 */
registerSkill({
  name: 'search_memory',
  description: '搜索历史记忆。当用户问"还记得之前说过什么""之前讨论过什么""有什么记忆"时使用。',
  args: [
    { name: 'query', type: 'string', required: true, description: '搜索关键词' },
  ],
  execute: async (args) => {
    const query = String(args.query || '');
    const repo = new MemoryRepository();
    const results = repo.searchAll(query.split(/\s+/));
    if (results.length === 0) return '未找到相关记忆';
    return results.slice(0, 5).map((m) => `- [${m.type}] ${m.content}`).join('\n');
  },
});

/** 用户画像查询 */
registerSkill({
  name: 'get_profile',
  description: '查询用户画像。当用户问"你知道我什么""你了解我多少""我的偏好"时使用。',
  args: [],
  execute: async () => {
    const profile = loadProfile();
    const parts: string[] = [];
    if (Object.keys(profile.facts).length > 0) {
      parts.push('已知信息:', ...Object.entries(profile.facts).map(([k, v]) => `  ${k}: ${v}`));
    }
    if (profile.preferences.length > 0) parts.push('偏好: ' + profile.preferences.join(', '));
    if (profile.interests.length > 0) parts.push('兴趣: ' + profile.interests.join(', '));
    if (profile.tasks.length > 0) parts.push('待办: ' + profile.tasks.join(', '));
    if (parts.length === 0) return '还没有积累用户画像信息，多聊几次后会自动建立。';
    parts.push(`\n对话次数: ${profile.conversationCount}`);
    return parts.join('\n');
  },
});

/** 时间日期 */
registerSkill({
  name: 'get_time',
  description: '获取当前时间日期。当用户问"现在几点""今天几号""当前时间"时使用。',
  args: [],
  execute: async () => {
    const now = new Date();
    return `当前时间: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
  },
});

/** 会话管理 */
registerSkill({
  name: 'create_session',
  description: '创建新会话。当用户说"新建会话""开个新对话"时使用。',
  args: [
    { name: 'title', type: 'string', required: false, description: '会话标题' },
  ],
  execute: async (args) => {
    const title = String(args.title || '新会话');
    const repo = new SessionRepository();
    const session = repo.create({ title, topic: 'other' });
    return `已创建会话: "${title}" (ID: ${session.id.slice(0, 8)})`;
  },
});

/** 系统信息 */
registerSkill({
  name: 'system_info',
  description: '查询阿罗德斯系统状态。当用户问"你能做什么""你有什么功能"时使用。',
  args: [],
  execute: async () => {
    const { getAllSkills } = await import('./registry');
    const skillNames = getAllSkills().map((s) => s.name).join(', ');
    return [
      '阿罗德斯当前能力：',
      '- 语音对话 (STT + LLM + TTS)',
      '- 系统操控 (执行命令、读写文件)',
      '- 记忆系统 (自动提取 + 画像更新)',
      '- 会话管理 (多会话切换)',
      '- 视觉理解 (Qwen3-VL)',
      `- 可用工具: ${skillNames}`,
    ].join('\n');
  },
});

// ===== Hermes 记忆管理技能 =====

/** 记忆统计 */
registerSkill({
  name: 'memory_stats',
  description: '查看记忆统计信息。当用户问"有多少记忆""记忆概况""我的记忆数据"时使用。',
  args: [],
  execute: async () => {
    const repo = new MemoryRepository();
    const all = repo.findAll();
    if (all.length === 0) return '目前还没有存储任何记忆。';

    const byType: Record<string, number> = {};
    const sessions = new Set<string>();
    for (const m of all) {
      byType[m.type] = (byType[m.type] || 0) + 1;
      sessions.add(m.sessionId);
    }

    const typeNames: Record<string, string> = { fact: '事实', preference: '偏好', event: '事件', task: '任务' };
    const lines = [`共 ${all.length} 条记忆，分布在 ${sessions.size} 个会话中：`];
    for (const [type, count] of Object.entries(byType)) {
      lines.push(`  ${typeNames[type] || type}: ${count} 条`);
    }
    return lines.join('\n');
  },
});

/** 列出全部记忆 */
registerSkill({
  name: 'memory_list_all',
  description: '列出所有记忆。当用户说"显示所有记忆""列出记忆""查看记忆"时使用。',
  args: [],
  execute: async () => {
    const repo = new MemoryRepository();
    const all = repo.findAll();
    if (all.length === 0) return '目前还没有存储任何记忆。';
    return all.slice(0, 20).map((m, i) => `${i + 1}. [${m.type}] ${m.content}`).join('\n')
      + (all.length > 20 ? `\n... 还有 ${all.length - 20} 条` : '');
  },
});

/** 清理记忆 */
registerSkill({
  name: 'memory_cleanup',
  description: '清理/删除记忆。当用户说"清理记忆""删除记忆""忘记xxx""清除记忆"时使用。',
  args: [
    { name: 'query', type: 'string', required: false, description: '要删除的记忆关键词，不填则清理 30 天前的旧记忆' },
  ],
  execute: async (args) => {
    const repo = new MemoryRepository();
    if (args.query) {
      const matched = repo.searchAll([String(args.query)]);
      if (matched.length === 0) return `未找到包含"${args.query}"的记忆。`;
      for (const m of matched) repo.delete(m.id);
      return `已删除 ${matched.length} 条包含"${args.query}"的记忆。`;
    }
    // 清理 30 天前的旧记忆
    const all = repo.findAll();
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    const old = all.filter((m) => new Date(m.createdAt).getTime() < cutoff);
    if (old.length === 0) return '没有 30 天前的旧记忆需要清理。';
    for (const m of old) repo.delete(m.id);
    return `已清理 ${old.length} 条 30 天前的旧记忆。`;
  },
});

/** 删除指定记忆 */
registerSkill({
  name: 'delete_memory',
  description: '删除指定记忆。当用户说"删除第N条记忆""删掉XXX记忆"时使用。',
  args: [
    { name: 'target', type: 'string', required: true, description: '要删除的记忆编号或关键词' },
  ],
  execute: async (args) => {
    const repo = new MemoryRepository();
    const all = repo.findAll();
    const target = String(args.target || '');

    // 尝试按编号
    const num = parseInt(target);
    if (!isNaN(num) && num > 0 && num <= all.length) {
      const m = all[num - 1];
      repo.delete(m.id);
      return `已删除: [${m.type}] ${m.content}`;
    }

    // 按关键词
    const matched = repo.searchAll(target.split(/\s+/));
    if (matched.length === 0) return `未找到包含"${target}"的记忆。`;
    if (matched.length === 1) {
      repo.delete(matched[0].id);
      return `已删除: [${matched[0].type}] ${matched[0].content}`;
    }
    return `找到 ${matched.length} 条匹配"${target}"的记忆，请使用 memory_cleanup 并指定 query="${target}" 来批量删除。`;
  },
});

// ===== MiniMax TTS 技能 =====

/** MiniMax TTS — 高质量中文语音合成 */
registerSkill({
  name: 'minimax_tts',
  description: '用 MiniMax 高质量语音朗读文本。当用户说"用更好的声音读""换个高质量语音""用 MiniMax 读"时使用。需配置 MINIMAX_API_KEY 环境变量。',
  args: [
    { name: 'text', type: 'string', required: true, description: '要朗读的文本' },
    { name: 'voice', type: 'string', required: false, description: '音色: male-qn-qingse(男声青涩) / female-shaonv(少女) / male-qn-jingying(精英男) / female-yujiexuemei(御姐)' },
  ],
  execute: async (args) => {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      return 'MiniMax TTS 未配置。请设置环境变量 MINIMAX_API_KEY。\n获取地址: https://platform.minimaxi.com\n\n可以免费试用，注册后在开发者中心创建 API Key。';
    }

    const text = String(args.text || '');
    if (!text) return '文本不能为空';
    if (text.length > 500) return '文本过长（最大 500 字）';

    const voice = String(args.voice || 'male-qn-qingse');
    const groupId = process.env.MINIMAX_GROUP_ID || '';

    try {
      const response = await fetch('https://api.minimax.chat/v1/t2a_v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'speech-02-turbo',
          text,
          stream: false,
          voice_setting: {
            voice_id: voice,
            speed: 1.0,
            vol: 1.0,
            pitch: 0,
          },
          audio_setting: {
            sample_rate: 32000,
            format: 'mp3',
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text().catch(() => '');
        return `MiniMax TTS 调用失败 (${response.status}): ${err.slice(0, 100)}`;
      }

      const data = await response.json() as any;
      if (data.base_resp?.status_code !== 0) {
        return `MiniMax TTS 错误: ${data.base_resp?.status_msg || '未知错误'}`;
      }

      // 返回 audio_base64 -> 前端播放
      const audioBase64 = data.data?.audio || data.audio;
      if (!audioBase64) return 'MiniMax TTS 返回的音频为空';

      // 保存到临时文件供前端访问
      const fs = await import('node:fs');
      const path = await import('node:path');
      const tmpDir = path.resolve('./data/tts');
      fs.mkdirSync(tmpDir, { recursive: true });
      const filename = `minimax_${Date.now()}.mp3`;
      fs.writeFileSync(path.join(tmpDir, filename), Buffer.from(audioBase64, 'hex'));

      return `MiniMax TTS 已合成。音频文件: /data/tts/${filename}\n音色: ${voice}\n文本: ${text.slice(0, 50)}...`;
    } catch (err) {
      return `MiniMax TTS 异常: ${err instanceof Error ? err.message : '未知错误'}`;
    }
  },
});

// ===== 系统操控技能 =====

/** 执行命令（安全沙箱） */
registerSkill({
  name: 'exec_command',
  description: '在本地电脑执行命令。当用户说"帮我跑""执行命令""打开XX""检查一下系统"时使用。仅允许非交互式命令，危险操作会被拦截。',
  args: [
    { name: 'command', type: 'string', required: true, description: '要执行的命令（如 dir, echo, git status 等非交互命令）' },
  ],
  execute: async (args) => {
    const cmd = String(args.command || '').trim();
    if (!cmd) return '错误: 命令不能为空';

    // 安全沙箱：拦截危险操作
    const blocked = [
      'rm -rf', 'del /S', 'del /F', 'format', 'shutdown', 'restart',
      'reg delete', 'sc delete', 'taskkill /F /IM', 'net stop', ':(){',
      '/dev/null >', 'mkfs', 'dd if=', '> nul', '2>nul',
    ];
    const cmdLower = cmd.toLowerCase();
    for (const b of blocked) {
      if (cmdLower.includes(b.toLowerCase())) return `安全拦截: 禁止执行含「${b}」的命令`;
    }

    try {
      const { execSync } = await import('node:child_process');
      const output = execSync(cmd, {
        cwd: process.cwd(),
        timeout: 30000,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
        windowsHide: true,
      });
      const clean = output.slice(0, 2000);
      return clean.trim() || '命令执行成功（无输出）';
    } catch (err: any) {
      const msg = err.stderr || err.message || String(err);
      return `命令执行失败: ${msg.slice(0, 500)}`;
    }
  },
});

/** 读取文件 */
registerSkill({
  name: 'read_file',
  description: '读取本地文件内容。当用户说"看看这个文件""帮我读一下那个文件""打开xx文件"时使用。仅限文本文件。',
  args: [
    { name: 'path', type: 'string', required: true, description: '文件路径（绝对路径或相对于工作目录的路径）' },
    { name: 'lines', type: 'number', required: false, description: '最多读取行数（默认 50）' },
  ],
  execute: async (args) => {
    const filePath = String(args.path || '').trim();
    const maxLines = Number(args.lines) || 50;
    if (!filePath) return '错误: 路径不能为空';

    // 拦截敏感文件
    const sensitive = ['.env', '.gitconfig', 'id_rsa', 'NTUSER.DAT', '.pfx', '.p12'];
    const fileName = filePath.split(/[/\\]/).pop()?.toLowerCase() || '';
    if (sensitive.some((s) => fileName.includes(s.toLowerCase()))) {
      return '安全拦截: 禁止读取敏感配置文件';
    }

    try {
      const fs = await import('node:fs');
      if (!fs.existsSync(filePath)) return `错误: 文件不存在 "${filePath}"`;

      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return `错误: "${filePath}" 不是一个文件`;
      if (stat.size > 500 * 1024) return `错误: 文件过大（${(stat.size / 1024).toFixed(1)}KB），最大 500KB`;

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const preview = lines.slice(0, maxLines).join('\n');
      const suffix = lines.length > maxLines ? `\n... (共 ${lines.length} 行，仅显示前 ${maxLines} 行)` : '';

      return `文件: ${filePath} (${(stat.size / 1024).toFixed(1)}KB, ${lines.length} 行)\n\`\`\`\n${preview}\n\`\`\`${suffix}`;
    } catch (err: any) {
      return `读取失败: ${err.message?.slice(0, 200) || String(err)}`;
    }
  },
});

/** 写入文件 */
registerSkill({
  name: 'write_file',
  description: '创建或写入本地文件。当用户说"帮我写一个文件""创建xx文件""保存到文件"时使用。会追加写入，不会覆盖已有内容。',
  args: [
    { name: 'path', type: 'string', required: true, description: '文件路径' },
    { name: 'content', type: 'string', required: true, description: '要写入的内容' },
    { name: 'overwrite', type: 'boolean', required: false, description: '是否覆盖已有文件（默认 false，追加写入）' },
  ],
  execute: async (args) => {
    const filePath = String(args.path || '').trim();
    const content = String(args.content || '');
    const overwrite = args.overwrite === true;
    if (!filePath) return '错误: 路径不能为空';
    if (!content) return '错误: 内容不能为空';

    // 拦截危险路径
    const dangerous = ['/etc/', '/boot/', 'C:\\Windows\\', 'C:\\Program Files\\', 'System32', '.bashrc', '.zshrc', '.env'];
    for (const d of dangerous) {
      if (filePath.replace(/\\/g, '/').toLowerCase().includes(d.toLowerCase().replace(/\\/g, '/'))) {
        return `安全拦截: 禁止写入系统路径 "${d}"`;
      }
    }

    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      if (!overwrite && fs.existsSync(filePath)) {
        // 追加模式
        fs.appendFileSync(filePath, '\n' + content, 'utf-8');
        return `已追加写入 ${filePath}`;
      }

      fs.writeFileSync(filePath, content, 'utf-8');
      return `已写入 ${filePath} (${content.length} 字符)`;
    } catch (err: any) {
      return `写入失败: ${err.message?.slice(0, 200) || String(err)}`;
    }
  },
});

// ===== 导出 =====
export { loadProfile } from '../services/MemoryGateway.js';
