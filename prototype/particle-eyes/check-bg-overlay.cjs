/* 仅用于本地验证「全屏背景模式」，不属于产品代码。node check-bg-overlay.cjs
 *
 * 要验的问题：全屏透明窗 = 星云直接画在用户桌面上。
 * 桌面可能是白的（Word/浏览器），这套暗底星云会不会把桌面糊掉？眼睛还看不看得见？
 * 方框里的"桌面底"我用纯色模拟，分别量「有叠加」与「无叠加」的亮度差。 */
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('C:/Users/29352/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIR = __dirname;
const OUT = path.join(DIR, 'shots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const BACKDROPS = [
  ['light', 'linear-gradient(135deg,#eef1f6 0%,#dfe6ef 45%,#f5f7fa 100%)'],
  ['mid', 'linear-gradient(135deg,#2c3546 0%,#1d2532 55%,#39445a 100%)'],
  ['dark', 'linear-gradient(135deg,#0b1018 0%,#060910 55%,#131a28 100%)']
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
           '--hide-scrollbars', '--mute-audio', '--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

  const errs = [];
  page.on('console', m => { const t = m.type(); if (t === 'error' || t === 'warning') errs.push(t + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await page.goto('file:///' + path.join(DIR, 'tuner.html').replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await sleep(1600);
  if (!(await page.evaluate(() => typeof window.__tuner === 'object'))) {
    console.log('着色器未挂载:\n' + errs.join('\n')); await browser.close(); process.exit(2);
  }
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#presets button')].find(x => x.textContent === '诸神');
    if (b) b.click();
  });
  await sleep(1100);
  await page.evaluate(() => {
    document.getElementById('fold').click();
    document.getElementById('badge').style.display = 'none';
    document.getElementById('fold').style.display = 'none';
  });
  await sleep(900);

  const setBg = (css) => page.evaluate((c) => { document.getElementById('bg').style.background = c; }, css);
  const blank = () => page.evaluate(() => window.__tuner.apply((c) => {
    c.look.solid = 0; c.look.dust = 0; c.look.voidNeb = 0; c.look.voidStar = 0;
  }));
  const restore = () => page.evaluate(() => {
    const b = [...document.querySelectorAll('#presets button')].find(x => x.textContent === '诸神');
    if (b) b.click();
  });

  // 中心区（眼睛所在）+ 全帧
  async function measure(tag) {
    const buf = await page.screenshot();
    fs.writeFileSync(path.join(OUT, `bg-${tag}.png`), buf);
    return await page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const grab = (bx, by, bw, bh) => {
        const d = x.getImageData(bx, by, bw, bh).data;
        let s = 0, mn = 999, mx = -1;
        for (let i = 0; i < d.length; i += 4) {
          const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
          s += v; if (v < mn) mn = v; if (v > mx) mx = v;
        }
        return { mean: +(s / (d.length / 4)).toFixed(1), mn: Math.round(mn), mx: Math.round(mx) };
      };
      return { all: grab(0, 0, c.width, c.height), core: grab(c.width / 2 - 420, c.height / 2 - 300, 840, 600) };
    }, buf.toString('base64'));
  }

  console.log('尺寸 1920×1080　「诸神」预设');
  console.log('底     | 空场景均值 | 叠加后均值 | 变化  | 中心最小亮度 | 中心最大亮度');
  for (const [tag, css] of BACKDROPS) {
    await setBg(css);
    await sleep(400);
    await blank(); await sleep(700);
    const b = await measure(tag + '-blank');
    await restore(); await sleep(1100);
    const f = await measure(tag + '-full');
    const d = (f.all.mean - b.all.mean).toFixed(1);
    console.log(`${tag.padEnd(6)} | ${String(b.all.mean).padStart(10)} | ${String(f.all.mean).padStart(10)} | ${(d >= 0 ? '+' + d : d).padStart(5)} | ${String(f.core.mn).padStart(12)} | ${String(f.core.mx).padStart(12)}`);
  }

  console.log('errors:', errs.length ? '\n' + errs.join('\n') : '(none)');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
