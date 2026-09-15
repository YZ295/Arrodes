// 验证 ensureOllama 的核心逻辑（脱离 Electron 环境单独跑）
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';

function isPortInUse(port, host = '127.0.0.1') {
  return new Promise((resolveOk) => {
    const sock = net.connect({ port, host });
    sock.once('connect', () => { sock.destroy(); resolveOk(true); });
    sock.once('error', () => { sock.destroy(); resolveOk(false); });
  });
}

function resolveOllamaBin() {
  const candidates = [
    process.env.ARRODES_OLLAMA_BIN,
    'E:\\AI\\Ollama\\ollama.exe',
    join(process.env.LOCALAPPDATA || '', 'Programs/Ollama/ollama.exe'),
    'C:\\Program Files\\Ollama\\ollama.exe',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || null;
}

let ollamaProc = null;

async function ensureOllama() {
  if (await isPortInUse(11434)) {
    console.log('[Desktop] Ollama 已在线（11434）');
    return;
  }
  const bin = resolveOllamaBin();
  if (!bin) {
    console.log('[Desktop] 未找到 ollama 可执行文件，屏幕观察将不可用');
    return;
  }
  console.log('[Desktop] 拉起 Ollama ->', bin);
  const proc = spawn(bin, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true });
  proc.unref();
  ollamaProc = proc;
  proc.on('exit', (code) => {
    console.log(`[Desktop] Ollama 退出（${String(code)}）`);
    if (ollamaProc === proc) ollamaProc = null;
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await isPortInUse(11434)) {
      console.log('[Desktop] Ollama 就绪（11434）');
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log('[Desktop] Ollama 20s 内未就绪');
}

const t0 = Date.now();
await ensureOllama();
console.log(`耗时 ${Date.now() - t0}ms`);
console.log('ollamaProc 已启动:', ollamaProc !== null);
process.exit(0);
