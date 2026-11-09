import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setCacheEnabled(false);
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=12', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 60000 });
await new Promise(r => setTimeout(r, 4500));
const info = await page.evaluate(() => {
  const w = window.game.world;
  return {
    beds: w.beds.length,
    shops: ['baitShop', 'gunShop', 'rodShop', 'chestShop', 'bagShop'].filter(k => w[k]).length,
    colliders: w.colliders.length,
    lighthouse: w.lighthouse,
    bed0: w.beds[0]
  };
});
console.log('INFO', JSON.stringify(info));
console.log('ERRORS', errs.length, JSON.stringify(errs));
await browser.close();
