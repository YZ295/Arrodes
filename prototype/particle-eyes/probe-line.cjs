/* 二分定位那条横穿全屏的线：逐个关掉候选层，测「眼外」区域的亮度 */
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('C:/Users/29352/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIR = __dirname;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 采样一行：返回该行所有像素的亮度剖面，用于找尖峰 */
async function rowProfile(page, buf, y0, y1) {
  return page.evaluate(async ([b64, a, b]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const rows = [];
    for (let y = a; y <= b; y++) {
      let s = 0, n = 0;
      for (let x = 0; x < 140; x++) { const i = (y * c.width + x) * 4; s += d[i] + d[i + 1] + d[i + 2]; n++; }
      rows.push([y, +(s / n / 3).toFixed(3)]);
    }
    return { rows, W: c.width, H: c.height };
  }, [buf.toString('base64'), y0, y1]);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
           '--hide-scrollbars', '--mute-audio', '--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 860, deviceScaleFactor: 1 });
  await page.goto('file:///' + path.join(DIR, 'tuner.html').replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await sleep(1600);
  await page.evaluate(() => document.getElementById('fold').click());
  await sleep(800);
  // 全关粒子，只留实体眼 —— 排除干扰
  await page.evaluate(() => window.__tuner.apply(c => {
    c.counts.voidDust = 0; c.counts.lid = 0; c.counts.iris = 0;
    c.counts.pupil = 0; c.counts.halo = 0; c.counts.highlight = 0; c.counts.glow = 0;
    c.look.dust = 0;
  }));
  await sleep(1000);

  async function probe(tag, fn) {
    if (fn) { await page.evaluate(fn); await sleep(800); }
    const buf = await page.screenshot();
    fs.writeFileSync(path.join(DIR, 'shots', 'probe-' + tag + '.png'), buf);
    const p = await rowProfile(page, buf, 380, 460);
    const peak = p.rows.reduce((m, r) => r[1] > m[1] ? r : m, ['-', -1]);
    const base = p.rows[0][1];
    console.log(tag.padEnd(22), '基线', String(base).padStart(7), ' 峰值 y=' + peak[0], String(peak[1]).padStart(7),
                ' 增益 ' + (peak[1] - base).toFixed(3));
    return { peak: peak[1], base, y: peak[0] };
  }

  const all = await probe('全部开启');
  await probe('关 glow', () => window.__tuner.apply(c => { c.look.glow = 0; }));
  await probe('关 glow + 关睫毛', () => window.__tuner.apply(c => { c.look.lashLen = 0; c.look.lashN = 0; }));
  await probe('关 glow + 关睫毛 + 关睑线', () => window.__tuner.apply(c => { c.look.lidLineW = 0; }));
  await probe('只关睫毛', () => window.__tuner.apply(c => { c.look.glow = 0.26; c.look.lidLineW = 0.026; c.look.lashLen = 0; c.look.lashN = 0; }));
  await probe('只关睑线', () => window.__tuner.apply(c => { c.look.lashLen = 0.16; c.look.lashN = 9; c.look.lidLineW = 0; }));
  await probe('全关后恢复', () => window.__tuner.apply(c => { c.look.lidLineW = 0.026; }));
  await probe('实体眼强度 0（纯黑底）', () => window.__tuner.apply(c => { c.look.solid = 0; }));

  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
