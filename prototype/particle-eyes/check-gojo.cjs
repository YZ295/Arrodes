/* 对照参考图验证「六眼」观察态配色：采样自己渲染的虹膜主色，与参考图取样值并列 */
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('C:/Users/29352/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIR = __dirname;
const OUT = path.join(DIR, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const sample = (page, buf, X0, Y0, X1, Y1) => page.evaluate(async ([b64, a, b, c2, d2]) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const at = (x, y) => { const i = ((y | 0) * c.width + (x | 0)) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const hex = a => '#' + a.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const lum = a => a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  const px = [];
  for (let y = b; y < d2; y++) for (let x = a; x < c2; x++) px.push(at(x, y));
  px.sort((u, v) => lum(u) - lum(v));
  const q = f => px[Math.min(px.length - 1, Math.floor(f * px.length))];
  const cyan = px.filter(v => v[2] > 130 && v[2] >= v[0] * 1.4).sort((u, v) => lum(v) - lum(u));
  return {
    n: px.length,
    p25: hex(q(0.25)), p50: hex(q(0.50)), p75: hex(q(0.75)), p90: hex(q(0.90)), p97: hex(q(0.97)),
    peak: hex(px[px.length - 1]),
    cyanN: cyan.length,
    cyanTop: cyan.slice(0, 4).map(hex),
    cyanMid: cyan.length ? hex(cyan[Math.floor(cyan.length / 2)]) : '-'
  };
}, [buf.toString('base64'), X0, Y0, X1, Y1]);

function line(tag, s) {
  console.log(tag.padEnd(14) + 'p25=' + s.p25 + ' p50=' + s.p50 + ' p75=' + s.p75 +
              ' p90=' + s.p90 + ' p97=' + s.p97 + ' peak=' + s.peak);
  console.log(' '.repeat(14) + '青蓝 ' + s.cyanN + 'px  最亮: ' + s.cyanTop.join(' ') + '  中位: ' + s.cyanMid);
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
  await sleep(1800);

  // ⚠️ 眼睛在 world 空间位于 x = ±eyeSep*eyeScale，而 world.x = ndc.x * aspect，
  //    所以 NDC 是 ±0.58/aspect —— 把 world 值当 NDC 用会随视口宽窄错位（面板一折叠就采到背景）。
  const NW = 1500, NH = 860, ASPECT = NW / NH;
  const CFG_EYE = { eyeSep: 1.16, eyeScale: 0.50, irisR: 0.555 };
  const eyeNDCx = -(CFG_EYE.eyeSep * CFG_EYE.eyeScale) / ASPECT;
  const cx = (1 + eyeNDCx) / 2 * NW;                 // 左眼中心 px
  const cy = NH / 2;
  const rIris = (CFG_EYE.irisR * CFG_EYE.eyeScale) / ASPECT / 2 * NW;   // 虹膜半径 px（x/y 一致）
  const K = 0.70;                                    // 只取虹膜内区，避开角膜缘与眼白
  const Z = {
    x0: Math.round(cx - rIris * K), x1: Math.round(cx + rIris * K),
    y0: Math.round(cy - rIris * K), y1: Math.round(cy + rIris * K)
  };
  console.log('左眼心 px=(' + cx.toFixed(1) + ',' + cy + ')  虹膜半径 ' + rIris.toFixed(1) + 'px');
  console.log('采样框:', JSON.stringify(Z), ' 尺寸', (Z.x1 - Z.x0) + 'x' + (Z.y1 - Z.y0));
  console.log('\n【参考图·五条悟右眼】p90=#08bfff p97=#2eeaf5 p99.5=#a7d8f0  青蓝主色: #0db7ff #0cbbff #08bfff  中位 #4f719b');

  // 全程折叠面板：交出无遮挡的整幅画面（双眼会互相重叠，单眼特写必然带进另一只眼的边缘）
  await page.evaluate(() => document.getElementById('fold').click());
  await sleep(900);
  const normal = await page.screenshot();
  fs.writeFileSync(path.join(OUT, 'gojo-normal-full.png'), normal);
  const sN = await sample(page, normal, Z.x0, Z.y0, Z.x1, Z.y1);
  console.log('\n【常态·星瞳】');
  line('  ', sN);

  await page.evaluate(() => {
    const el = document.getElementById('scrub-observe');
    el.value = '1'; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(1300);
  const obs = await page.screenshot();
  fs.writeFileSync(path.join(OUT, 'gojo-observe-full.png'), obs);
  const sO = await sample(page, obs, Z.x0, Z.y0, Z.x1, Z.y1);
  console.log('\n【观察态·六眼】');
  line('  ', sO);

  fs.writeFileSync(path.join(OUT, 'gojo-sample.json'),
    JSON.stringify({ z: Z, normal: sN, observe: sO,
                     ref: { p90: '#08bfff', p97: '#2eeaf5', p905: '#a7d8f0',
                            main: '#0db7ff', mid: '#4f719b', dark: '#141d29' } }, null, 2));
  console.log('\n采样已写入 shots/gojo-sample.json');

  console.log('\nerrors:', errs.length ? '\n' + errs.join('\n') : '(none)');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
