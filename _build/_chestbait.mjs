import puppeteer from 'puppeteer-core';
const V = Date.now();
const ROOT = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0,200)));
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.setCacheEnabled(false);
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 2600));
const out = await page.evaluate(() => {
  const E = window.Economy;
  E.balance = 60000;
  const lines = [];
  for (let i = 0; i < 12; i++) {
    const r = E.openChest('gold');
    if (r && r.results) r.results.forEach(x => { if (/鱼饵|蚯蚓|虾肉|亮片|秘制/.test(x.text + x.name)) lines.push(x.name + ' :: ' + x.text); });
  }
  return { baits: { ...E.baits }, total: E.totalBait(), lines: lines.slice(0, 8) };
});
console.log(JSON.stringify(out, null, 1));
console.log('ERRS ' + errs.length + (errs.length ? ' :: ' + errs[0] : ''));
await browser.close();
