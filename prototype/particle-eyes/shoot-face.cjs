/* 仅用于本地验证「阿罗德斯形象」着色器，不属于产品代码。
 * node shoot-face.cjs
 *
 * 关键：所有亮度度量都限制在**左眼方框**内，不是整帧。
 * 整帧 1500×860 里眼睛只占 ~3%，光环关掉也才掉 0.2 —— 那点 Δ 根本判不出层有没有画。
 */
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('C:/Users/29352/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIR = __dirname;
const OUT = path.join(DIR, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 页面内：给定截图 base64 + 左眼框，算这个框里的平均亮度 / 亮像素
async function regionMetric(page, b64, box) {
  return await page.evaluate(async (b64in, boxin) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64in; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(boxin[0], boxin[1], boxin[2], boxin[3]).data;
    let sum = 0, lit = 0, i;
    for (i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; sum += v; if (v > 300) lit++; }
    const n = d.length / 4;
    return { mean: +(sum / n / 3).toFixed(2), lit, n };
  }, b64, box);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
           '--hide-scrollbars', '--mute-audio', '--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 860, deviceScaleFactor: 1 });

  const errs = [];
  page.on('console', m => { const t = m.type(); if (t === 'error' || t === 'warning') errs.push(t + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await page.goto('file:///' + path.join(DIR, 'tuner.html').replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await sleep(1500);

  const mounted = await page.evaluate(() => typeof window.__tuner === 'object');
  console.log('着色器已挂载:', mounted);
  if (!mounted) { console.log(errs.join('\n')); await browser.close(); process.exit(2); }

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#presets button')].find(x => x.textContent === '诸神');
    if (b) b.click();
  });
  await sleep(1200);
  await page.evaluate(() => {
    document.getElementById('fold').click();
    // 出图用：把验证台自己的 UI 藏掉，否则角标文案会印进设计稿
    document.getElementById('badge').style.display = 'none';
    document.getElementById('fold').style.display = 'none';
  });
  await sleep(700);

  // 左眼方框（世界坐标 → NDC → 像素；绝不能拿世界坐标当 NDC 用）
  const box = await page.evaluate(() => {
    const cfg = window.__tuner.cfg();
    const W = document.getElementById('stage').clientWidth;
    const H = document.getElementById('stage').clientHeight;
    const aspect = W / H;
    const scale = cfg.eyeScale * Math.min(1, aspect / 0.92);
    const ndcX = -(cfg.eyeSep * scale) / aspect;
    const cx = (1 + ndcX) / 2 * W;
    const cy = H / 2;
    const r = (scale / aspect) / 2 * W;
    return [Math.round(cx - r * 1.25), Math.round(cy - r * 1.25), Math.round(r * 2.5), Math.round(r * 2.5)];
  });
  console.log('左眼框(px):', JSON.stringify(box));

  async function snap(name, patch) {
    if (patch) {
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('#presets button')].find(x => x.textContent === '诸神');
        if (b) b.click();
      });
      await sleep(650);
      await page.evaluate((p) => {
        window.__tuner.apply(function (cfg) {
          for (const k in p) {
            const parts = k.split('.'); let o = cfg;
            for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
            o[parts[parts.length - 1]] = p[k];
          }
        });
      }, patch);
      await sleep(900);
    }
    const buf = await page.screenshot();
    if (name) fs.writeFileSync(path.join(OUT, 'face-' + name + '.png'), buf);
    return await regionMetric(page, buf.toString('base64'), box);
  }

  const base = await snap('stars', null);
  console.log('基准(星瞳):', JSON.stringify(base));

  const layers = [
    ['螺旋光纹', { 'look.spiralOn': 0 }],
    ['星系虹膜', { 'look.neb': 0, 'look.galaxy': 0 }],
    ['十字星芒', { 'look.flare': 0 }],
    ['睫毛', { 'look.lashN': 0 }],
    ['睑线', { 'look.lidLineW': 0 }],
    ['粒子层整体', { 'look.solid': 0 }],
    ['粒子·星尘', { 'look.dust': 0 }],
    ['粒子·光晕', { 'u.haloMul': 0 }]
  ];
  for (const [label, patch] of layers) {
    const m = await snap(null, patch);
    console.log(`  关「${label}」→ ${base.mean} → ${m.mean}  (Δ ${(m.mean - base.mean).toFixed(2)}, 亮像素 ${base.lit} → ${m.lit})`);
  }

  // 状态图
  for (const [name, st] of [['observe', 'observe'], ['void', 'void']]) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#presets button')].find(x => x.textContent === '诸神');
      if (b) b.click();
    });
    await sleep(700);
    await page.evaluate((s) => {
      const b = [...document.querySelectorAll('#panel [data-s]')].find(x => x.getAttribute('data-s') === s);
      if (b) b.click();
    }, st);
    await sleep(1400);
    await page.screenshot({ path: path.join(OUT, 'face-' + name + '.png') });
  }

  // 单眼特写
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#presets button')].find(x => x.textContent === '诸神');
    if (b) b.click();
  });
  await sleep(900);
  await page.evaluate((b) => {
    const b2 = [...document.querySelectorAll('#panel [data-s]')].find(x => x.getAttribute('data-s') === 'eyes');
    if (b2) b2.click();
  }, box);
  await sleep(1400);
  await page.screenshot({ path: path.join(OUT, 'face-macro.png'), clip: { x: box[0], y: box[1], width: box[2], height: box[3] } });

  // 桌宠窗口实景：桌宠窗口固定 660×600，最终要在这个尺寸里成立才算数
  await page.setViewport({ width: 660, height: 600, deviceScaleFactor: 2 });
  await sleep(1600);
  await page.screenshot({ path: path.join(OUT, 'face-pet660.png') });
  await page.setViewport({ width: 1500, height: 860, deviceScaleFactor: 1 });
  await sleep(900);

  console.log('errors:', errs.length ? '\n' + errs.join('\n') : '(none)');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
