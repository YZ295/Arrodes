import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSttMode, setSttMode, setSttSettingsDirForTest } from './sttSettings.js';

let dir = '';

describe('sttSettings 持久化', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'arrodes-stt-'));
    setSttSettingsDirForTest(dir);
  });
  afterEach(() => {
    setSttSettingsDirForTest(null);
    rmSync(dir, { recursive: true, force: true });
  });

  it('未配置时默认 online', () => {
    expect(getSttMode()).toBe('online');
  });

  it('set 后 get 返回持久化值', () => {
    setSttMode('local');
    expect(getSttMode()).toBe('local');
  });

  it('损坏的配置文件回退默认值', () => {
    writeFileSync(join(dir, 'stt-mode.json'), '{bad json', 'utf-8');
    expect(getSttMode()).toBe('online');
  });
});
