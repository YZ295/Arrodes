import { describe, it, expect } from 'vitest';
import { matchWakePhrase } from './wakeWord';

describe('matchWakePhrase 唤醒词', () => {
  it('匹配「嘿阿罗德斯」', () => {
    expect(matchWakePhrase('嘿阿罗德斯')).toBe(true);
  });

  it('匹配带前后空白的「嗨阿罗德斯」', () => {
    expect(matchWakePhrase('  嗨阿罗德斯  ')).toBe(true);
  });

  it('匹配繁体「嘿阿羅德斯」', () => {
    expect(matchWakePhrase('嘿阿羅德斯')).toBe(true);
  });

  it('不匹配普通对话', () => {
    expect(matchWakePhrase('今天天气怎么样')).toBe(false);
  });

  it('不匹配仅提到阿罗德斯（无唤醒前缀）', () => {
    expect(matchWakePhrase('帮我查一下阿罗德斯')).toBe(false);
  });
});
