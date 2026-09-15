import { describe, it, expect } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpClient, parseMcpServers } from './mcpClient.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fakeServer = join(__dirname, '../../test/fake-mcp-server.mjs');

describe('mcpClient（HoloJarvis mcp_bridge 借鉴，JSON-RPC over stdio）', () => {
  it('initialize + tools/list 返回工具', async () => {
    const client = new McpClient({ name: 'fake', command: process.execPath, args: [fakeServer] });
    try {
      const tools = await client.listTools();
      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('echo');
    } finally {
      client.close();
    }
  });

  it('tools/call 返回文本内容', async () => {
    const client = new McpClient({ name: 'fake', command: process.execPath, args: [fakeServer] });
    try {
      const result = await client.callTool('echo', { text: 'hello' });
      expect(result.content[0].text).toBe('echo:hello');
    } finally {
      client.close();
    }
  });

  it('请求超时抛错', async () => {
    const client = new McpClient({
      name: 'fake-slow',
      command: process.execPath,
      args: [fakeServer],
      env: { FAKE_MCP_SLOW: '1' },
    });
    try {
      await expect(client.callTool('echo', {}, 300)).rejects.toThrow(/超时/);
    } finally {
      client.close();
    }
  });

  it('parseMcpServers 过滤非法项', () => {
    expect(parseMcpServers('')).toEqual([]);
    expect(parseMcpServers('not-json')).toEqual([]);
    expect(parseMcpServers(JSON.stringify([{ name: 'a', command: 'node' }, { name: 'bad' }]))).toEqual([
      { name: 'a', command: 'node' },
    ]);
  });
});
