/* 仅用于本地验证形象设计稿页面，不属于产品代码。node check-board.cjs */
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('C:/Users/29352/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIR = path.join(__dirname, '..', 'arrodes-face');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--allow-file-access-from-files', '--hide-scrollbars', '--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 1000, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('requestfailed', r => errs.push('资源加载失败: ' + r.url()));
  await page.goto('file:///' + path.join(DIR, 'index.html').replace(/\\/g, '/'), { waitUntil: 'networkidle2' });
  await sleep(600);

  const info = await page.evaluate(() => {
    const imgs = [...document.images].map(i => ({ src: i.getAttribute('src'), w: i.naturalWidth, h: i.naturalHeight }));
    return { title: document.title, h: document.body.scrollHeight, imgs };
  });
  console.log('页面高度:', info.h);
  info.imgs.forEach(i => console.log(`  ${i.w}×${i.h}  ${i.src}`));
  const bad = info.imgs.filter(i => !i.w);
  console.log(bad.length ? '❌ 有图未加载' : '✅ 图片全部加载');
  await page.screenshot({ path: path.join(DIR, 'board-preview.png'), fullPage: true });
  console.log('errors:', errs.length ? '\n' + errs.join('\n') : '(none)');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
