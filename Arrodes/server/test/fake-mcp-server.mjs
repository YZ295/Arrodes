/**
 * Fake MCP server（stdio JSON-RPC）—— mcpClient 测试用
 * FAKE_MCP_SLOW=1 时 tools/call 不响应（用于超时测试）
 */
process.stdin.setEncoding('utf8');

let buf = '';

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.method === 'initialize') {
      respond(msg.id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'fake-mcp', version: '1.0.0' },
      });
    } else if (msg.method === 'tools/list') {
      respond(msg.id, {
        tools: [{ name: 'echo', description: 'echo tool', inputSchema: { type: 'object' } }],
      });
    } else if (msg.method === 'tools/call') {
      if (process.env.FAKE_MCP_SLOW === '1') return; // 故意不响应
      const args = msg.params?.arguments ?? {};
      respond(msg.id, { content: [{ type: 'text', text: 'echo:' + String(args.text ?? '') }] });
    } else if (msg.method === 'notifications/initialized') {
      // 通知无需响应
    } else {
      respond(msg.id, { error: { code: -32601, message: 'method not found' } });
    }
  }
});
