/* 仅用于本地验证捏脸台，不属于产品代码 */
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('C:/Users/29352/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIR = __dirname;
const OUT = path.join(DIR, 'shots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
           '--hide-scrollbars', '--mute-audio', '--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 860, deviceScaleFactor: 1 });

  const errs = [];
  page.on('console', m => { const t = m.type(); if (t === 'error' || t === 'warning') errs.push(t + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await page.goto('file:///' + path.join(DIR, 'tuner.html').replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1800));

  const info = await page.evaluate(() => ({
    particles: document.getElementById('stat-count').textContent,
    attr: document.getElementById('stat-attr').textContent,
    fps: document.getElementById('stat-fps').textContent,
    tabs: [...document.querySelectorAll('#tabs button')].map(b => b.textContent),
    sliders: document.querySelectorAll('#body input[type=range]').length,
    presets: [...document.querySelectorAll('#presets button')].map(b => b.textContent)
  }));
  console.log('面板:', JSON.stringify(info));
  await page.screenshot({ path: path.join(OUT, 'tuner-default.png') });

  // 1) 拖动滑杆 —— 应触发重烘 + 粒子数变化
  await page.click('#tabs button:nth-child(3)');            // 星点
  await new Promise(r => setTimeout(r, 250));
  await page.evaluate(() => {
    const el = document.getElementById('s-counts.iris');
    el.value = '4600';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 700));
  console.log('拖滑杆后粒子数:', await page.evaluate(() => document.getElementById('stat-count').textContent));

  // 2) 预设
  await page.evaluate(() => {
    const bs = [...document.querySelectorAll('#presets button')];
    bs.find(b => b.textContent === '银河').click();
  });
  await new Promise(r => setTimeout(r, 900));
  await page.screenshot({ path: path.join(OUT, 'tuner-preset-galaxy.png') });

  await page.evaluate(() => {
    const bs = [...document.querySelectorAll('#presets button')];
    bs.find(b => b.textContent === '血瞳').click();
  });
  await new Promise(r => setTimeout(r, 900));
  await page.screenshot({ path: path.join(OUT, 'tuner-preset-blood.png') });

  // 3) 手动 scrub 到合聚中途
  await page.evaluate(() => {
    const bs = [...document.querySelectorAll('#presets button')];
    bs.find(b => b.textContent === '原始').click();
  });
  await new Promise(r => setTimeout(r, 900));
  await page.evaluate(() => {
    const el = document.getElementById('scrub-summon');
    el.value = '0.62';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(OUT, 'tuner-scrub-mid.png') });
  console.log('scrub 读数:', await page.evaluate(() => document.getElementById('v-summon').textContent));

  // 4) 隐藏面板后的干净画面
  await page.evaluate(() => {
    const el = document.getElementById('scrub-summon');
    el.value = '1';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('fold').click();
  });
  await new Promise(r => setTimeout(r, 900));
  const buf = await page.screenshot({ path: path.join(OUT, 'tuner-clean.png') });

  const m = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let mnx = 1e9, mny = 1e9, mxx = -1, mxy = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i] + d[i + 1] + d[i + 2] > 380) {
          if (x < mnx) mnx = x; if (x > mxx) mxx = x;
          if (y < mny) mny = y; if (y > mxy) mxy = y;
        }
      }
    }
    return { canvas: c.width + 'x' + c.height, w: mxx - mnx, h: mxy - mny, eyeRatio: +((mxx - mnx) / 2 / Math.max(1, mxy - mny)).toFixed(2) };
  }, buf.toString('base64'));
  console.log('眼型度量:', JSON.stringify(m));

  console.log('errors:', errs.length ? '\n' + errs.join('\n') : '(none)');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
