/* 仅用于本地原型截图验证，不属于产品代码 */
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('C:/Users/29352/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIR = __dirname;
const URL_BASE = 'file:///' + path.join(DIR, 'index.html').replace(/\\/g, '/');
const OUT = path.join(DIR, 'shots');
fs.mkdirSync(OUT, { recursive: true });

// 用页面里的 2D canvas 分析截图，量出亮像素的包围盒 —— 用来客观核对眼型比例
async function measure(page, buf) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const box = (x0, x1) => {
      let mnx = 1e9, mny = 1e9, mxx = -1, mxy = -1, n = 0;
      for (let y = 0; y < c.height; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * c.width + x) * 4;
          if (d[i] + d[i + 1] + d[i + 2] > 380) {
            n++;
            if (x < mnx) mnx = x; if (x > mxx) mxx = x;
            if (y < mny) mny = y; if (y > mxy) mxy = y;
          }
        }
      }
      return { w: mxx - mnx, h: mxy - mny, ratio: +((mxx - mnx) / Math.max(1, mxy - mny)).toFixed(2), px: n };
    };
    const half = Math.floor(c.width / 2);
    return { canvas: c.width + 'x' + c.height, all: box(0, c.width), leftEye: box(0, half) };
  }, buf.toString('base64'));
}

const VIEWPORTS = [
  ['wide', 1440, 810, 1],
  ['pet', 660, 600, 2]
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-sandbox',
      '--disable-dev-shm-usage'
    ]
  });

  const errors = [];

  for (const [tag, w, h, dsf] of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: dsf });
    page.on('console', m => {
      const t = m.type();
      if (t === 'error' || t === 'warning') errors.push('[' + tag + '] ' + t + ': ' + m.text());
    });
    page.on('pageerror', e => errors.push('[' + tag + '] pageerror: ' + e.message));

    await page.goto(URL_BASE + '?hud=0', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__eyes && window.__eyes.get', { timeout: 20000 });

    const count = await page.evaluate('window.__eyes.get().count');
    console.log('[' + tag + '] particles =', count);

    for (const state of ['void', 'mid', 'eyes', 'observe']) {
      await page.evaluate(s => window.__eyes.set(s === 'mid' ? 'eyes' : s), state);
      await new Promise(r => setTimeout(r, state === 'void' ? 1000 : state === 'mid' ? 620 : 2800));
      const buf = await page.screenshot({ path: path.join(OUT, tag + '-' + state + '.png') });
      if (state !== 'void') {
        const m = await measure(page, buf);
        console.log('[' + tag + '/' + state + '] ' + JSON.stringify(m));
      }
    }
    await page.close();
  }

  console.log('errors:', errors.length ? '\n' + errors.join('\n') : '(none)');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
