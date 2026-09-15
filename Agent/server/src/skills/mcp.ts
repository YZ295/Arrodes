/**
 * MCP 技能（生态标准接入，简报 2026-08-12：MCP 是工具层标准）
 *
 * 配置：环境变量 MCP_SERVERS = JSON 数组 [{name, command, args?, env?}]
 * mcp_call_tool 默认高风险（可能影响外部系统），需用户确认。
 */
import { registerSkill } from './registry.js';
import { loadMcpRegistry } from '../services/mcpClient.js';

const registry = loadMcpRegistry();

function parseToolArgs(raw: unknown): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  if (raw == null || raw === '') return { ok: true, args: {} };
  try {
    const parsed = JSON.parse(String(raw));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ok: true, args: parsed as Record<string, unknown> };
    }
    return { ok: false, error: 'arguments 必须是 JSON 对象' };
  } catch {
    return { ok: false, error: 'arguments 不是合法 JSON' };
  }
}

function toolArgsOrEmpty(raw: unknown): Record<string, unknown> {
  const result = parseToolArgs(raw);
  return result.ok ? result.args : {};
}

/** 直通执行（确认后调用，绕过门禁） */
export async function executeMcpCallDirect(
  server: string,
  tool: string,
  toolArgs: Record<string, unknown>,
): Promise<string> {
  const client = registry.get(server);
  if (!client) return `未找到 MCP 服务器: ${server}`;
  try {
    const result = await client.callTool(tool, toolArgs);
    const texts = (result.content ?? [])
      .map((c) => c.text ?? JSON.stringify(c))
      .filter((t) => t && t.length > 0)
      .join('\n');
    return texts || `已调用 ${server}.${tool}`;
  } catch (err) {
    return `调用失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}

registerSkill({
  name: 'mcp_list_tools',
  description: '列出已配置 MCP 服务器及其可用工具。当用户问"有哪些 MCP 工具""外部工具列表"时使用。',
  args: [
    { name: 'server', type: 'string', required: false, description: '服务器名，不填则列出全部' },
  ],
  execute: async (args) => {
    const names = registry.list();
    if (names.length === 0) {
      return '未配置 MCP 服务器。设置环境变量 MCP_SERVERS（JSON 数组，含 name/command）后重启生效。';
    }
    const lines: string[] = [];
    for (const name of names) {
      const client = registry.get(name)!;
      try {
        const tools = await client.listTools();
        lines.push(`[${name}] ${tools.map((t) => t.name + (t.description ? ` - ${t.description.slice(0, 60)}` : '')).join('; ') || '（无工具）'}`);
      } catch (err) {
        lines.push(`[${name}] 连接失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return lines.join('\n');
  },
});

registerSkill({
  name: 'mcp_call_tool',
  description: '调用 MCP 服务器上的工具。当用户要求通过外部 MCP 工具执行操作时使用（高风险，需确认）。',
  args: [
    { name: 'server', type: 'string', required: true, description: 'MCP 服务器名' },
    { name: 'tool', type: 'string', required: true, description: '工具名' },
    { name: 'arguments', type: 'string', required: false, description: 'JSON 字符串形式的工具参数' },
  ],
  risk: 'high',
  describe: (args) => `调用 MCP 工具 ${String(args.server ?? '')}.${String(args.tool ?? '')}`,
  execute: async (args) => {
    const server = String(args.server || '').trim();
    const client = registry.get(server);
    if (!client) {
      return `未找到 MCP 服务器: ${server}（已配置: ${registry.list().join(', ') || '无'}）`;
    }
    const tool = String(args.tool || '').trim();
    if (!tool) return '错误: 工具名不能为空';

    const parsedArgs = parseToolArgs(args.arguments);
    if (!parsedArgs.ok) {
      return `错误: ${parsedArgs.error}`;
    }
    return executeMcpCallDirect(server, tool, parsedArgs.args);
  },
});
