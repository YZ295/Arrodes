import { WebSocket } from 'ws';
import { randomUUID, createHash } from 'node:crypto';

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_TTS_WS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';

function generateSecMsGec() {
  const WIN_EPOCH_SECONDS = BigInt(11644473600);
  const unixSeconds = BigInt(Math.floor(Date.now() / 1000));
  let ticks = unixSeconds + WIN_EPOCH_SECONDS;
  ticks -= ticks % 300n;
  ticks *= 10000000n;
  const str = ticks.toString() + TRUSTED_CLIENT_TOKEN;
  return createHash('sha256').update(str, 'ascii').digest('hex').toUpperCase();
}

const connectionId = randomUUID().replace(/-/g, '');
const secMsGec = generateSecMsGec();
const wsUrl = EDGE_TTS_WS_URL + '?TrustedClientToken=' + TRUSTED_CLIENT_TOKEN + '&Sec-MS-GEC=' + secMsGec + '&Sec-MS-GEC-Version=1-143.0.3650.75&ConnectionId=' + connectionId;
console.log('Connecting...');

const ws = new WebSocket(wsUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
    'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'en-US,en;q=0.9',
  },
});

ws.on('open', () => {
  console.log('OPEN - sending config...');
  const configMsg = [
    'X-Timestamp:' + new Date().toISOString(),
    'Content-Type:application/json; charset=utf-8',
    'Path:speech.config',
    '',
    JSON.stringify({
      context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'true' }, outputFormat: 'audio-24khz-48kbitrate-mono-mp3' } } },
    }),
  ].join('\r\n');
  ws.send(configMsg);
  
  const ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'><voice name='zh-CN-XiaoxiaoNeural'>你好</voice></speak>";
  const ssmlMsg = [
    'X-RequestId:' + randomUUID().replace(/-/g, ''),
    'Content-Type:application/ssml+xml',
    'X-Timestamp:' + new Date().toISOString(),
    'Path:ssml',
    '',
    ssml,
  ].join('\r\n');
  ws.send(ssmlMsg);
  console.log('Sent SSML');
});

let audioReceived = false;
ws.on('message', (data, isBinary) => {
  if (isBinary) {
    audioReceived = true;
    console.log('Audio chunk: ' + data.length + ' bytes');
  } else {
    const msg = data.toString();
    if (msg.includes('Path:turn.end')) {
      console.log('TURN END - success! audio=' + audioReceived);
      ws.close();
      process.exit(0);
    }
  }
});

ws.on('error', (err) => { console.error('ERROR:', err.message); process.exit(1); });
ws.on('close', (code) => { console.log('CLOSE code=' + code); process.exit(code !== 1000 ? 1 : 0); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 15000);
