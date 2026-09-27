/* 仅用于本地验证「实体眼」渲染层，不属于产品代码
 * 顺序很重要：先用「关掉全部粒子」的场景测干净 bbox，再据此裁剪，
 * 否则虚空余尘会把包围盒撑满，裁剪框直接切掉眼睛。 */
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('C:/Users/29352/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIR = __dirname;
const OUT = path.join(DIR, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function bboxOf(page, buf, thr) {
  return page.evaluate(async ([b64, T]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let mnx = 1e9, mny = 1e9, mxx = -1, mxy = -1, lit = 0, sx = 0, sy = 0;
    const rowSum = new Array(c.height).fill(0);
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        const v = d[i] + d[i + 1] + d[i + 2];
        if (v > T) { lit++; sx += x; sy += y; rowSum[y]++;
          if (x < mnx) mnx = x; if (x > mxx) mxx = x;
          if (y < mny) mny = y; if (y > mxy) mxy = y; }
      }
    }
    return { W: c.width, H: c.height, mnx, mny, mxx, mxy, lit,
             cx: +(sx / Math.max(1, lit)).toFixed(1), cy: +(sy / Math.max(1, lit)).toFixed(1),
             maxRow: rowSum.reduce((a, v, i) => v > rowSum[a] ? i : a, 0),
             maxRowN: Math.max.apply(null, rowSum) };
  }, [buf.toString('base64'), thr]);
}

/* 横线检测：某一行亮像素数远超其它行 → 就是贯穿线 */
function widestRow(b) { return { row: b.maxRow, n: b.maxRowN, w: b.mxx - b.mnx }; }

async function diffRatio(page, a, b) {
  return page.evaluate(async ([x, y]) => {
    async function grab(b64) {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height);
    }
    const A = await grab(x), B = await grab(y);
    let n = 0;
    for (let i = 0; i < A.data.length; i += 4) {
      const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
      if (d > 24) n++;
    }
    return +(n / (A.data.length / 4)).toFixed(4);
  }, [a.toString('base64'), b.toString('base64')]);
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

  const boot = await page.evaluate(() => ({
    log: (document.getElementById('log') || {}).value || '',
    tabs: [...document.querySelectorAll('#tabs button')].map(b => b.textContent),
    sliders: document.querySelectorAll('#body input[type=range]').length,
    roles: window.__tuner.roles()
  }));
  console.log('启动日志:', boot.log.trim() || '(空 = 无 uniform 缺失)');
  console.log('tab:', boot.tabs.join(' / '));
  console.log('角色分布:', JSON.stringify(boot.roles.roles), 'total', boot.roles.total);

  await page.evaluate(() => document.getElementById('fold').click());
  await sleep(900);
  const geo = await page.evaluate(() => {
    const c = document.getElementById('stage');
    return { css: c.clientWidth + 'x' + c.clientHeight, buf: c.width + 'x' + c.height };
  });
  console.log('画布:', JSON.stringify(geo));

  // ---- 1) 关掉全部粒子，测干净的实体眼 bbox ----
  await page.evaluate(() => window.__tuner.apply(c => {
    c.counts.voidDust = 0; c.counts.lid = 0; c.counts.iris = 0;
    c.counts.pupil = 0; c.counts.halo = 0; c.counts.highlight = 0; c.counts.glow = 0;
    c.look.dust = 0;
  }));
  await sleep(1200);
  const onlyBuf = await page.screenshot();
  fs.writeFileSync(path.join(OUT, 'solid-only.png'), onlyBuf);
  const ob = await bboxOf(page, onlyBuf, 300);
  console.log('仅实体眼 bbox:', JSON.stringify({ w: ob.mxx - ob.mnx, h: ob.mxy - ob.mny,
    mnx: ob.mnx, mxx: ob.mxx, mny: ob.mny, mxy: ob.mxy, cx: ob.cx, cy: ob.cy, lit: ob.lit }));
  console.log('最宽行:', JSON.stringify(widestRow(ob)), '  ← 若 n≈宽度则横线仍在');

  // 单眼裁剪（左眼）
  const EYEW = Math.round((ob.mxx - ob.mnx) / 2), EYEH = ob.mxy - ob.mny;
  const CLIP = {
    x: Math.max(0, ob.mnx - 18), y: Math.max(0, ob.mny - 18),
    width: Math.min(1500 - Math.max(0, ob.mnx - 18), EYEW + 36),
    height: Math.min(860 - Math.max(0, ob.mny - 18), EYEH + 36)
  };
  console.log('单眼裁剪:', JSON.stringify(CLIP));
  fs.writeFileSync(path.join(OUT, 'eye-l-solid.png'), await page.screenshot({ clip: CLIP }));
  const CLIP_R = { x: CLIP.x + EYEW, y: CLIP.y, width: CLIP.width, height: CLIP.height };
  fs.writeFileSync(path.join(OUT, 'eye-r-solid.png'), await page.screenshot({ clip: CLIP_R }));

  // 观察态
  await page.evaluate(() => {
    const el = document.getElementById('scrub-observe');
    el.value = '1'; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(1200);
  fs.writeFileSync(path.join(OUT, 'eye-l-observe.png'), await page.screenshot({ clip: CLIP }));
  await page.evaluate(() => {
    const el = document.getElementById('scrub-observe');
    el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(800);

  // ---- 2) 恢复默认：粒子 + 实体眼（最终观感）----
  await page.evaluate(() => {
    const bs = [...document.querySelectorAll('#presets button')];
    if (bs.find(b => b.textContent === '原始')) bs.find(b => b.textContent === '原始').click();
  });
  await sleep(600);
  await page.evaluate(() => window.__tuner.apply(c => { c.look.dust = 0.32; }));
  await sleep(1200);
  const fullBuf = await page.screenshot();
  fs.writeFileSync(path.join(OUT, 'full-default.png'), fullBuf);
  fs.writeFileSync(path.join(OUT, 'eye-l-full.png'), await page.screenshot({ clip: CLIP }));

  // ---- 3) 纯粒子（实体眼 0）对比 ----
  await page.evaluate(() => window.__tuner.apply(c => { c.look.solid = 0; }));
  await sleep(1000);
  const pureBuf = await page.screenshot({ clip: CLIP });
  fs.writeFileSync(path.join(OUT, 'eye-l-particles.png'), pureBuf);
  await page.evaluate(() => window.__tuner.apply(c => { c.look.solid = 1; }));
  await sleep(1000);

  // ---- 4) 参数敏感度抽查 ----
  async function probe(fn, tag) {
    await page.evaluate(fn);
    await sleep(800);
    const b = await page.screenshot({ clip: CLIP });
    fs.writeFileSync(path.join(OUT, 'probe-' + tag + '.png'), b);
    return b;
  }
  const base = await page.screenshot({ clip: CLIP });
  await page.evaluate(() => document.getElementById('fold').click());  // 展开面板以验证滑杆存在
  await page.evaluate(() => window.__tuner.apply(c => { c.look.cornerT = 0; c.look.cornerI = 0; }));
  await sleep(800);
  const flat = await page.screenshot({ clip: CLIP });
  fs.writeFileSync(path.join(OUT, 'probe-flat-eye.png'), flat);
  console.log('眼角参数 on vs off 差异:', await diffRatio(page, base, flat));
  await page.evaluate(() => window.__tuner.apply(c => { c.look.cornerT = 0.55; c.look.cornerI = 0.45; }));
  await sleep(600);

  console.log('实体眼 vs 纯粒子 差异:', await diffRatio(page, base, pureBuf));

  // FPS
  await sleep(1400);
  const fps = await page.evaluate(() => document.getElementById('stat-fps').textContent);
  console.log('FPS:', fps);

  console.log('errors:', errs.length ? '\n' + errs.join('\n') : '(none)');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
