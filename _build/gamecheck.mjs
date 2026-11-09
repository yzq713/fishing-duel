import puppeteer from 'puppeteer-core';
import fs from 'fs';

const URL = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html';
const OUT = 'D:/下载/fab/game';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--window-size=1280,760']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });

await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
try { await page.waitForFunction('window.game && window.game.world', { timeout: 40000 }); } catch { console.log('WAIT TIMEOUT'); }
await new Promise(r => setTimeout(r, 4000));

const st = await page.evaluate(() => {
  const g = window.game;
  if (!g) return { noGame: true };
  return {
    state: g.state,
    hasWorld: !!g.world,
    shops: {
      bait: g.world.baitShop, gun: g.world.gunShop,
      rod: g.world.rodShop, chest: g.world.chestShop, bag: g.world.bagShop
    },
    marketReady: !!(window.MarketAsset && window.MarketAsset.isReady && window.MarketAsset.isReady()),
    inlineAsset: !!(window.MARKET_ASSETS && window.MARKET_ASSETS.length),
    sceneChildren: g.world && g.world.root ? g.world.root.children.length : -1
  };
});
console.log(JSON.stringify(st, null, 1));
console.log('ERRORS:', errs.slice(0, 6).join('\n'));
await page.screenshot({ path: OUT + '/boot.png' });
await browser.close();
