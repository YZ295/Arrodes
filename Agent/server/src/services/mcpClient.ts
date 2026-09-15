/**
 * MCP（Model Context Protocol）客户端桥
 *
 * HoloJarvis mcp_bridge 借鉴：以 stdio 方式 spawn 外部 MCP server，
 * JSON-RPC 2.0 完成 initialize → tools/list → tools/call。
 * 配置：环境变量 MCP_SERVERS = JSON 数组 [{name, command, args?, env?}]
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpCallResult {
  content: Array<{ type: string; text?: string; [k: string]: unknown }>;
  isError?: boolean;
}

export function parseMcpServers(raw: string | undefined): McpServerConfig[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (c): c is McpServerConfig =>
        !!c && typeof c === 'object' && typeof (c as McpServerConfig).name === 'string'
        && typeof (c as McpServerConfig).command === 'string',
    );
  } catch {
    return [];
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class McpClient {
  private proc: ChildProcess | null = null;
  private buffer = '';
  private pending = new Map<string, PendingRequest>();
  private initialized = false;

  constructor(private config: McpServerConfig) {}

  private start(): void {
    if (this.proc) return;
    const child = spawn(this.config.command, this.config.args ?? [], {
      env: { ...process.env, ...this.config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.proc = child;
    child.stdout?.on('data', (d: Buffer) => this.onData(d.toString()));
    child.stderr?.on('data', (d: Buffer) => {
      const line = d.toString().trim();
      if (line) console.warn(`[MCP:${this.config.name}] ${line.slice(0, 200)}`);
    });
    child.on('exit', (code) => {
      this.proc = null;
      this.initialized = false;
      this.rejectAll(new Error(`MCP server 退出 (code=${code})`));
    });
    child.on('error', (err) => {
      this.proc = null;
      this.rejectAll(err);
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as { id?: unknown; result?: unknown; error?: unknown };
        const key = String(msg.id);
        const p = this.pending.get(key);
        if (p) {
          this.pending.delete(key);
          clearTimeout(p.timer);
          if (msg.error) p.reject(new Error(`MCP 错误: ${JSON.stringify(msg.error)}`));
          else p.resolve(msg.result);
        }
      } catch {
        // 忽略非 JSON 行
      }
    }
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    this.start();
    if (!this.proc || !this.proc.stdin || !this.proc.stdin.writable) {
      return Promise.reject(new Error(`MCP 进程不可用: ${this.config.name}`));
    }
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP 请求超时: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc!.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  private notify(method: string, params: unknown): void {
    if (!this.proc || !this.proc.stdin || !this.proc.stdin.writable) return;
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'arrodes', version: '0.1.0' },
    }, 15000);
    this.initialized = true;
    this.notify('notifications/initialized', {});
  }

  async listTools(): Promise<McpTool[]> {
    await this.initialize();
    const result = (await this.request('tools/list', {}, 15000)) as { tools?: McpTool[] };
    return result?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>, timeoutMs = 30000): Promise<McpCallResult> {
    await this.initialize();
    return (await this.request('tools/call', { name, arguments: args }, timeoutMs)) as McpCallResult;
  }

  close(): void {
    this.rejectAll(new Error('MCP client 已关闭'));
    try {
      this.proc?.kill('SIGTERM');
    } catch {
      // ignore
    }
    this.proc = null;
  }

  private rejectAll(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }
}

export class McpRegistry {
  private clients = new Map<string, McpClient>();

  constructor(servers: McpServerConfig[]) {
    for (const s of servers) {
      this.clients.set(s.name, new McpClient(s));
    }
  }

  list(): string[] {
    return Array.from(this.clients.keys());
  }

  get(name: string): McpClient | undefined {
    return this.clients.get(name);
  }

  closeAll(): void {
    for (const client of this.clients.values()) client.close();
  }
}

export function loadMcpRegistry(rawEnv?: string): McpRegistry {
  return new McpRegistry(parseMcpServers(rawEnv ?? process.env.MCP_SERVERS));
}
