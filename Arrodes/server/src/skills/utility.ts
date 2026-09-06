/**
 * 通用技能：时间 / 会话 / 系统信息 / MiniMax TTS
 */
import { registerSkill } from './registry.js';
import { SessionRepository } from '../db/session-repo.js';

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

      const audioBase64 = data.data?.audio || data.audio;
      if (!audioBase64) return 'MiniMax TTS 返回的音频为空';

      const fs = await import('node:fs');
      const path = await import('node:path');
      const tmpDir = path.resolve('./data/tts');
      fs.mkdirSync(tmpDir, { recursive: true });
      const filename = `minimax_${Date.now()}.mp3`;
      fs.writeFileSync(path.join(tmpDir, filename), Buffer.from(audioBase64, 'base64'));

      return `MiniMax TTS 已合成。音频文件: /data/tts/${filename}\n音色: ${voice}\n文本: ${text.slice(0, 50)}...`;
    } catch (err) {
      return `MiniMax TTS 异常: ${err instanceof Error ? err.message : '未知错误'}`;
    }
  },
});
