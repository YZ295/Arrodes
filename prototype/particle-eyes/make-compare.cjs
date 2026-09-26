/* 生成「参考图 vs 渲染结果」并排对比图（含取色数字），用于交付评审 */
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('C:/Users/29352/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIR = __dirname;
const OUT = path.join(DIR, 'shots');

const REF = 'C:\\Users\\29352\\.workbuddy\\clipboard-images\\clipboard-2026-09-26T12-33-49-522Z-a210cd11.png';
const b64 = p => fs.readFileSync(p).toString('base64');

(async () => {
  const refB64 = b64(REF);
  const obsB64 = b64(path.join(OUT, 'gojo-observe-full.png'));
  const norB64 = b64(path.join(OUT, 'gojo-normal-full.png'));

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:1560px;height:1040px;background:#05070d;color:#c2d2ea;
         font-family:"Microsoft YaHei","Segoe UI",system-ui,sans-serif;
         display:flex;gap:22px;padding:22px 26px;}
    .col{display:flex;flex-direction:column;gap:10px}
    .lab{font-size:13px;letter-spacing:.08em;color:#7f95b6}
    .lab b{color:#dbe9ff;font-weight:600}
    .card{border:1px solid rgba(120,170,255,.20);border-radius:10px;overflow:hidden;background:#03050a;
          display:flex;align-items:center;justify-content:center}
    .card img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}
    .k{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;line-height:1.75;color:#8fa8ca}
    .k i{display:inline-block;width:11px;height:11px;border-radius:2px;vertical-align:-1px;margin-right:6px;
         border:1px solid rgba(255,255,255,.28)}
    .hit{color:#7ff0a8}
    .hd{color:#dbe9ff}
  </style></head><body>
    <div class="col" style="width:286px">
      <div class="lab">参考 · <b>五条悟「六眼」</b></div>
      <div class="card" style="width:286px;height:960px">
        <img src="data:image/png;base64,${refB64}"></div>
    </div>

    <div class="col" style="flex:1">
      <div class="lab">阿罗德斯 · <b>观察态（六眼）</b>　← 对标参考</div>
      <div class="card" style="height:434px"><img src="data:image/png;base64,${obsB64}"></div>

      <div class="lab" style="margin-top:6px">阿罗德斯 · <b>常态（星瞳）</b>　← 你原来的"双眼中含星空"</div>
      <div class="card" style="height:434px"><img src="data:image/png;base64,${norB64}"></div>
    </div>

    <div class="col" style="width:330px">
      <div class="lab"><b>取色对照</b>　同区域对同区域</div>
      <div class="k">
        <i style="background:#0cb7ff"></i>参考·<b>眼睛主体</b> #0cb7ff (12,175,255)<br>
        <i style="background:#0eadff"></i>渲染·观察态 p25 #0eadff (14,173,255)<br>
        <span class="hit">&nbsp;&nbsp;→ 差 (2,10,0) ✓</span><br><br>
        <i style="background:#2eeaf5"></i>参考·亮部 #2eeaf5 (46,234,245)<br>
        <i style="background:#13f5ff"></i>渲染·p75 #13f5ff (19,245,255)<br><br>
        <i style="background:#141d29"></i>参考·暗部 #141d29<br>
        <i style="background:#16418a"></i>渲染·常态 p25 #16418a<br><br>
        <span style="color:#7f95b6">B−G：参考 72　渲染 83（同为蓝青）</span><br>
        <span style="color:#7f95b6">观察态青蓝像素 27184 px</span>
      </div>

      <div class="lab" style="margin-top:16px"><b>采样方法</b></div>
      <div class="k" style="color:#5f7699">
        参考图：整图网格采样，把出现最多的<br>
        青蓝值作为"眼睛主体色"。<br>
        渲染：按几何算左眼虹膜中心与半径<br>
        （<span class="hd">world.x = ndc.x·aspect</span>，眼睛在<br>
        world 空间 ±0.58，NDC 要除 aspect），<br>
        取 70% 半径内区，p25 即主体色。
      </div>

      <div class="lab" style="margin-top:16px"><b>上一版为什么偏青</b></div>
      <div class="k" style="color:#5f7699">
        irisMid 的 G 给到 0.72，再叠 0.40 乘性<br>
        自发光 → G、B 双双溢出饱和，输出<br>
        <span style="color:#ff9a9a">#12fdff（B−G=2）</span>，成了青绿。<br>
        把 G 压到 0.52 留出余量即回到蓝青。
      </div>

      <div class="lab" style="margin-top:16px"><b>本轮：眼白 → 虚空、睫毛去掉</b></div>
      <div class="k" style="color:#5f7699">
        眼白不是"涂成深色"，而是 <span class="hd">alpha 归零</span> ——<br>
        背景虚空（含余尘星点）直接透出，<br>
        所以眼白里是<b>真实星点</b>而不是假深色。<br><br>
        连带三处：睑线关闭（虚空化后闭合<br>
        睑线会变成突兀的"眼框"）；外发光锚点<br>
        从眼型轮廓改到<span class="hd">虹膜边缘</span>；<br>
        角膜缘暗环减弱 62%（它乘完接近纯黑，<br>
        比 #070d19 的虚空还暗，会在交界处<br>
        显出一圈脏污暗月牙）。
      </div>

      <div class="lab" style="margin-top:16px"><b>与参考的差异</b></div>
      <div class="k" style="color:#5f7699">
        参考图虹膜几乎<b>顶满眼眶</b>（上下贴眼睑），<br>
        当前是完整圆形虹膜。<br>
        想更贴：<b>虹膜</b>页签调「虹膜半径」，<br>
        加大即被上下眼睑裁出眼型。<br>
        <span style="color:#ff9a9a">（实测 0.66 会裁成"压扁鼓形"，<br>
        反而不像眼睛，建议 0.58~0.62 之间试）</span>
      </div>
    </div>
  </body></html>`;

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--enable-unsafe-swiftshader', '--no-sandbox', '--hide-scrollbars', '--allow-file-access-from-files']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1560, height: 1040, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 700));
  const out = path.join(OUT, 'gojo-compare.png');
  await page.screenshot({ path: out });
  console.log('已生成', out);
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
