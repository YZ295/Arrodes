/* 诊断：几何定位 + 那条神秘水平线的来源 */
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('C:/Users/29352/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIR = __dirname;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function bbox(page, buf) {
  return page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let mnx = 1e9, mny = 1e9, mxx = -1, mxy = -1, lit = 0, sx = 0, sy = 0;
    // 逐行亮度直方图，用来找那条横线
    const rowSum = new Array(c.height).fill(0);
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        const v = d[i] + d[i + 1] + d[i + 2];
        if (v > 380) { lit++; sx += x; sy += y; rowSum[y]++;
          if (x < mnx) mnx = x; if (x > mxx) mxx = x;
          if (y < mny) mny = y; if (y > mxy) mxy = y; }
      }
    }
    return { W: c.width, H: c.height, mnx, mny, mxx, mxy, lit,
             cx: +(sx / Math.max(1, lit)).toFixed(1), cy: +(sy / Math.max(1, lit)).toFixed(1),
             rowSum };
  }, buf.toString('base64'));
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

  const geo = await page.evaluate(() => {
    const c = document.getElementById('stage');
    const r = c.getBoundingClientRect();
    return {
      css: { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) },
      buffer: { w: c.width, h: c.height },
      dpr: window.devicePixelRatio,
      cfg: (function (c) {
        return { eyeSep: c.eyeSep, eyeScale: c.eyeScale, lidH: c.lidH, lidP: c.lidP,
                 irisR: c.irisR, pupilR: c.pupilR, lowerK: c.lowerK };
      })(window.__tuner.cfg())
    };
  });
  console.log('折叠前 几何:', JSON.stringify(geo));

  // 只留实体眼：干掉所有粒子
  await page.evaluate(() => window.__tuner.apply(c => {
    c.counts.voidDust = 0; c.counts.lid = 0; c.counts.iris = 0;
    c.counts.pupil = 0; c.counts.halo = 0; c.counts.highlight = 0; c.counts.glow = 0;
    c.eyeSep = 0.0; c.eyeScale = 0.60; c.look.dust = 0;
  }));
  await sleep(1200);

  const fullA = await page.screenshot();
  fs.writeFileSync(path.join(DIR, 'shots', 'diag-solidonly-panel.png'), fullA);
  const bA = await bbox(page, fullA);
  console.log('仅实体眼(面板展开) bbox:', JSON.stringify({ W: bA.W, H: bA.H, w: bA.mxx - bA.mnx, h: bA.mxy - bA.mny, mnx: bA.mnx, mxx: bA.mxx, cx: bA.cx, cy: bA.cy, lit: bA.lit }));
  const rows = bA.rowSum.map((v, i) => [i, v]).filter(r => r[1] > 0);
  console.log('亮行数:', rows.length, ' 最亮行 top5:', rows.sort((a, b) => b[1] - a[1]).slice(0, 5).map(r => r[0] + ':' + r[1]).join(' '));

  // 折叠面板：会改变 #stage 的 CSS 尺寸，但不会触发 window.resize
  await page.evaluate(() => document.getElementById('fold').click());
  await sleep(900);
  const geo2 = await page.evaluate(() => {
    const c = document.getElementById('stage');
    const r = c.getBoundingClientRect();
    return { css: { w: Math.round(r.width), h: Math.round(r.height) }, buffer: { w: c.width, h: c.height } };
  });
  const fullB = await page.screenshot();
  fs.writeFileSync(path.join(DIR, 'shots', 'diag-solidonly-folded.png'), fullB);
  const bB = await bbox(page, fullB);
  console.log('折叠后 几何:', JSON.stringify(geo2));
  console.log('仅实体眼(面板折叠) bbox:', JSON.stringify({ w: bB.mxx - bB.mnx, h: bB.mxy - bB.mny, mnx: bB.mnx, mxx: bB.mxx, cx: bB.cx, cy: bB.cy, lit: bB.lit }));

  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
