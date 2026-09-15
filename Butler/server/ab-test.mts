// 实验 2：GEC 算法修正（十进制 ticks）。Float 模拟 edge-tts 的 Python double 路径 vs BigInt 精确路径
import { randomUUID, createHash } from 'node:crypto';
import { WebSocket } from 'ws';

const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold';
const WIN_EPOCH = 11644473600;

// edge-tts Python 路径：ticks(float) = (unix + epoch) 对齐 300 后 * 1e7；str = f"{ticks:.0f}" + token
function gecFloat(): string {
  const unix = Math.floor(Date.now() / 1000);
  let ticks = unix + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks = ticks * 1e7; // 转为 double，模拟 Python float 舍入
  const s = ticks.toString(); // JS shortest round-trip
  return createHash('sha256').update(s + TOKEN, 'ascii').digest('hex').toUpperCase();
}

// 精确 BigInt 路径
function gecBigInt(): string {
  const unix = BigInt(Math.floor(Date.now() / 1000));
  let ticks = unix + BigInt(WIN_EPOCH);
  ticks -= ticks % 300n;
  ticks *= 10000000n;
  const s = ticks.toString();
  return createHash('sha256').update(s + TOKEN, 'ascii').digest('hex').toUpperCase();
}

function tryConnect(label: string, url: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { headers });
    const timer = setTimeout(() => {
      ws.terminate();
      resolve(`${label}: 超时`);
    }, 10000);
    ws.on('open', () => {
      clearTimeout(timer);
      ws.close();
      resolve(`${label}: 连接成功`);
    });
    ws.on('unexpected-response', (_req, res) => {
      clearTimeout(timer);
      resolve(`${label}: HTTP ${res.statusCode}`);
    });
    ws.on('error', (e) => {
      clearTimeout(timer);
      resolve(`${label}: error ${e.message}`);
    });
  });
}

const connId = randomUUID().replace(/-/g, '');
const base = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TOKEN}&ConnectionId=${connId}`;
const gecF = gecFloat();
const gecB = gecBigInt();
console.log(`GEC float=${gecF}`);
console.log(`GEC big  =${gecB}`);

const mk = (gec: string, ver: string, ua: string) => ({
  url: `${base}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${ver}`,
  headers: { 'User-Agent': ua, 'Origin': ORIGIN, 'Cookie': `muid=${randomUUID().replace(/-/g, '').toUpperCase()};` },
});

const ua130 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.68';
const ua143 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';

const E = mk(gecF, '1-130.0.2849.68', ua130);
const F = mk(gecF, '1-143.0.3650.75', ua143);
const G = mk(gecB, '1-143.0.3650.75', ua143);
const H = mk(gecB, '1-130.0.2849.68', ua130);

console.log(await tryConnect('E floatGEC v130', E.url, E.headers));
console.log(await tryConnect('F floatGEC v143', F.url, F.headers));
console.log(await tryConnect('G bigGEC   v143', G.url, G.headers));
console.log(await tryConnect('H bigGEC   v130', H.url, H.headers));
process.exit(0);
