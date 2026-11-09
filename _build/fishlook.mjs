import puppeteer from 'puppeteer-core';
const VIEWS = (process.argv[3] || '').split(',').filter(Boolean);
const names = process.argv[2] || '苍龙,恐龙';
const tag = process.argv[4] || 'a';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--window-size=1200,760']
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
await page.setCacheEnabled(false);
const url = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/_preview_fish.html?names=' +
  encodeURIComponent(names) + '&v=' + Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await new Promise(r => setTimeout(r, 1200));
console.log(JSON.stringify(await page.evaluate(() => window.__info)));
console.log(JSON.stringify(await page.evaluate(() => window.__list())));
for (const v of (VIEWS.length ? VIEWS : ['side', 'q', 'top', 'head'])) {
  await page.evaluate((k) => window.__view(k), v);
  await new Promise(r => setTimeout(r, 260));
  await page.screenshot({ path: `D:/下载/fishprobe/fm_${tag}_${v}.png` });
  console.log('shot', v);
}
await browser.close();
