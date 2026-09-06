import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const serverPackage = JSON.parse(readFileSync(resolve(serverDir, 'package.json'), 'utf-8')) as { scripts: Record<string, string> };
const desktopPackage = JSON.parse(readFileSync(resolve(serverDir, '../desktop/package.json'), 'utf-8')) as { scripts: Record<string, string> };
const desktopMain = readFileSync(resolve(serverDir, '../desktop/main.ts'), 'utf-8');
const viteConfig = readFileSync(resolve(serverDir, '../client/vite.config.ts'), 'utf-8');
const messageChannel = readFileSync(resolve(serverDir, '../client/src/core/MessageChannel.ts'), 'utf-8');

describe('发布脚本', () => {
  it('服务端测试只发现当前 src 测试文件', () => {
    expect(serverPackage.scripts.test).toBe('vitest run src');
  });

  it('桌面打包在 Electron 编译前重新构建服务端和客户端', () => {
    expect(desktopPackage.scripts['build:assets']).toBe('npm --prefix ../server run build && npm --prefix ../client run build');
    expect(desktopPackage.scripts.pack).toContain('npm run build:assets');
    expect(desktopPackage.scripts.dist).toContain('npm run build:assets');
  });

  it('开发模式从 desktop/dist 回到工作区根目录查找后端构建产物', () => {
    expect(desktopMain).toContain("resolve(__dirname, '../../server/dist/index.js')");
  });

  it('浏览器开发代理从临时环境变量向受保护的 API 和 WebSocket 注入令牌', () => {
    expect(viteConfig).toContain("'x-arrodes-local-token': process.env.ARRODES_DEV_TOKEN");
    expect(viteConfig).toContain("'/api': {");
    expect(viteConfig).toContain("'/v1/chat': {");
  });

  it('浏览器版 WebSocket 默认连接当前页面主机，以便通过本机开发代理', () => {
    expect(messageChannel).toContain('window.location.host');
  });
});
