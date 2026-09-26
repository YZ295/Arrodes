/* 从参考图里客观取色：用 Chrome 解码 + canvas 采样，避免装 Pillow */
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('C:/Users/29352/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const SRC = process.argv[2] || 'C:\\Users\\29352\\.workbuddy\\clipboard-images\\clipboard-2026-09-26T12-33-49-522Z-a210cd11.png';
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

const b64 = fs.readFileSync(SRC).toString('base64');
const ext = path.extname(SRC).slice(1).toLowerCase();

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
           '--no-sandbox', '--mute-audio', '--hide-scrollbars']
  });
  const page = await browser.newPage();
  await page.goto('about:blank');

  const res = await page.evaluate(async ([data, mime]) => {
    const img = new Image();
    img.src = 'data:image/' + mime + ';base64,' + data;
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const D = ctx.getImageData(0, 0, W, H).data;

    const at = (x, y) => { const i = ((y | 0) * W + (x | 0)) * 4; return [D[i], D[i + 1], D[i + 2]]; };
    const hex = a => '#' + a.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    const lum = a => (a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722);
    const sat = a => { const mx = Math.max.apply(null, a), mn = Math.min.apply(null, a); return mx === 0 ? 0 : (mx - mn) / mx; };

    /* 在给定矩形里按亮度分位取样，并统计"青色度"最高的一撮 */
    function zone(name, x0, y0, x1, y1, gridN) {
      const X0 = Math.round(x0 * W), Y0 = Math.round(y0 * H);
      const X1 = Math.round(x1 * W), Y1 = Math.round(y1 * H);
      const px = [];
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) px.push(at(x, y));
      px.sort((a, b) => lum(a) - lum(b));
      const q = f => px[Math.min(px.length - 1, Math.floor(f * px.length))];
      // 青色度：B 高、G 中高、R 低
      const cyan = px.filter(a => a[2] > 120 && a[2] > a[0] * 1.35 && a[1] > a[0]).sort((a, b) => lum(b) - lum(a));
      return {
        name, rect: [X0, Y0, X1, Y1], n: px.length,
        p05: hex(q(0.05)), p25: hex(q(0.25)), p50: hex(q(0.50)), p75: hex(q(0.75)),
        p90: hex(q(0.90)), p97: hex(q(0.97)), p995: hex(q(0.995)),
        maxLum: +lum(px[px.length - 1]).toFixed(0),
        cyanN: cyan.length,
        cyanTop: cyan.slice(0, 5).map(hex),
        cyanMid: cyan.length ? hex(cyan[Math.floor(cyan.length / 2)]) : '-',
        grid: (function () {
          const rows = [];
          for (let gy = 0; gy < gridN; gy++) {
            let row = '';
            for (let gx = 0; gx < gridN; gx++) {
              const xx = X0 + (X1 - X0) * (gx + 0.5) / gridN, yy = Y0 + (Y1 - Y0) * (gy + 0.5) / gridN;
              const a = at(xx, yy); row += hex(a).slice(1) + ' ';
            }
            rows.push(row.trim());
          }
          return rows.join('\n        ');
        })()
      };
    }

    return { W, H, zones: [
      zone('整图', 0, 0, 1, 1, 6),
      zone('右眼(画面右下)', 0.60, 0.58, 1.00, 0.86, 8),
      zone('左眼镜片区', 0.30, 0.28, 0.62, 0.62, 8),
      zone('眼周皮肤/发', 0.62, 0.86, 0.95, 1.00, 6)
    ]};
  }, [b64, ext === 'jpg' ? 'jpeg' : ext]);

  console.log('参考图尺寸:', res.W + 'x' + res.H);
  for (const z of res.zones) {
    console.log('\n=== ' + z.name + ' === rect=' + z.rect.join(',') + ' 像素=' + z.n);
    console.log('  亮度分位 p05=' + z.p05 + ' p25=' + z.p25 + ' p50=' + z.p50 + ' p75=' + z.p75 + ' p90=' + z.p90 + ' p97=' + z.p97 + ' p99.5=' + z.p995 + ' 峰值亮度=' + z.maxLum);
    console.log('  青蓝像素 ' + z.cyanN + ' 个，最亮 5 个: ' + z.cyanTop.join(' ') + '，中位: ' + z.cyanMid);
    console.log('  网格采样:\n        ' + z.grid);
  }
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
