import puppeteer from 'puppeteer-core';

const URL = process.argv[2] || 'http://127.0.0.1:8799/_preview_fm.html';
const OUT = process.argv[3] || 'D:/下载/fab';
const MODE = process.argv[4] || 'views';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--hide-scrollbars']
});
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 720, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
await page.goto(URL, { waitUntil: 'load', timeout: 40000 });
try {
  await page.waitForFunction('window.__ready===true || window.__err', { timeout: 40000 });
} catch { console.log('WAIT TIMEOUT'); }
const info = await page.evaluate(() => ({ info: window.__info, err: window.__err, parts: (window.__parts || []).length }));
console.log(JSON.stringify(info).slice(0, 600));
await new Promise(r => setTimeout(r, 800));

if (MODE === 'views') {
  for (let i = 0; i < 5; i++) {
    await page.evaluate((k) => window.__view(k), i);
    await new Promise(r => setTimeout(r, 350));
    await page.screenshot({ path: `${OUT}/view${i}.png` });
    console.log('view', i, 'ok');
  }
} else if (MODE === 'centers') {
  const c = await page.evaluate(() => window.__centers());
  console.log(JSON.stringify(c));
} else if (MODE.startsWith('iso')) {
  // iso:node1,node2
  const names = MODE.slice(4).split(',');
  await page.evaluate((n) => window.__isolate(n), names);
  for (const v of [0, 1, 2]) {
    await page.evaluate((k) => window.__view(k), v);
    await new Promise(r => setTimeout(r, 300));
    await page.screenshot({ path: `${OUT}/iso_${names.join('_')}_${v}.png` });
  }
  console.log('iso done', names.join(','));
}
await browser.close();
