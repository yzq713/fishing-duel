import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
const list = await page.evaluate(() => {
  const cs = window.game.world.colliders;
  return cs.filter(c => c.minX < -28 && c.maxX > -34).map(c => ({
    x: [+c.minX.toFixed(2), +c.maxX.toFixed(2)],
    z: [+c.minZ.toFixed(2), +c.maxZ.toFixed(2)],
    y: [+c.minY.toFixed(2), +c.maxY.toFixed(2)],
    tag: c.tag
  }));
});
console.log(JSON.stringify(list, null, 0));
await browser.close();
