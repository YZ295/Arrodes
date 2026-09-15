/**
 * 唤醒词匹配
 *
 * 识别「嘿/嗨 阿罗德斯」及其繁体写法。仅匹配带唤醒前缀的完整短语，
 * 避免普通对话中仅提到「阿罗德斯」就被误触发。
 */
const WAKE_PHRASES = [
  '嘿阿罗德斯',
  '嗨阿罗德斯',
  '嘿阿羅德斯',
  '嗨阿羅德斯',
];

export function matchWakePhrase(text: string): boolean {
  const t = text.trim();
  return WAKE_PHRASES.some((phrase) => t.includes(phrase));
}
