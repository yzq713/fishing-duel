import puppeteer from 'puppeteer-core';
const V = Date.now();
const ROOT = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.setCacheEnabled(false);
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 2500));
const out = await page.evaluate(() => {
  const g = window.game;
  g.renderShop();
  document.getElementById('weaponOverlay').classList.remove('hidden');
  const ov = document.getElementById('weaponOverlay');
  const panel = ov.querySelector('.panel');
  const cs = getComputedStyle(panel);
  const ovs = getComputedStyle(ov);
  return {
    viewport: [innerWidth, innerHeight],
    overlay: { display: ovs.display, align: ovs.alignItems, overflow: ovs.overflow, pad: ovs.padding },
    panel: { h: panel.clientHeight, sh: panel.scrollHeight, max: cs.maxHeight, overflowY: cs.overflowY, rect: panel.getBoundingClientRect().toJSON() },
    gridH: document.getElementById('gunGrid').clientHeight,
    rodH: document.getElementById('rodGrid').clientHeight
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
