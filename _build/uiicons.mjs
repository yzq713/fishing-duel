import puppeteer from 'puppeteer-core';

const V = Date.now();
const ROOT = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/';
const OUT = 'D:/下载/fishprobe/';
const errs = [];
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader',
    '--allow-file-access-from-files', '--window-size=1280,760']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise((r) => setTimeout(r, 2500));

await page.evaluate(() => {
  const E = window.Economy;
  E.balance = 8000;
  E.baits = { worm: 14, shrimp: 8, lure: 3, secret: 2 };
  E.baitSel = 'shrimp';
  E.fishBag = [
    { name: '锦鲤', points: 92, tier: 3, sea: false, dist: 12, t: Date.now() },
    { name: '深海皇带鱼', points: 1500, tier: 7, sea: true, dist: 40, t: Date.now() }
  ];
  E.items = [{ name: '珍珠', kind: '珍宝', sea: true, t: Date.now() }];
  [['苍龙', 3200, 7], ['锦鲤', 92, 3], ['小银鱼', 20, 0], ['深海皇带鱼', 1500, 7], ['恐龙', 2600, 7]].forEach(([n, p, t]) => {
    const e = E.addPondFish(n, p, t);
    window.game.world.addPondFish(n, e.points, e.id, e.tier);
  });
  E.save();
});

await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise((r) => setTimeout(r, 2200));

// ---- 观鱼台 ----
const pondInfo = await page.evaluate(() => {
  const g = window.game;
  g.state = 'paused';
  g.overlaySource = 'game';
  g.overlayKind = 'pond';
  g.renderPond();
  document.getElementById('pondOverlay').classList.remove('hidden');
  const cards = Array.from(document.querySelectorAll('#pondBody .pond-card'));
  return cards.map((c) => ({
    name: c.querySelector('.pond-name') ? c.querySelector('.pond-name').textContent : '?',
    hasSvg: !!c.querySelector('.pond-icon svg'),
    iconW: c.querySelector('.pond-icon svg') ? c.querySelector('.pond-icon svg').getBoundingClientRect().width : 0,
    iconHTML: c.querySelector('.pond-icon') ? c.querySelector('.pond-icon').innerHTML.slice(0, 120) : ''
  }));
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: OUT + 'ui_pond.png' });
const box = await page.evaluate(() => {
  const el = document.querySelector('#pondBody');
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
await page.screenshot({ path: OUT + 'ui_pond_zoom.png', clip: { x: box.x, y: box.y, width: box.w, height: Math.min(box.h, 320) } });

// ---- 鱼市 ----
const mktInfo = await page.evaluate(() => {
  const g = window.game;
  g.overlayKind = 'bait';
  document.getElementById('pondOverlay').classList.add('hidden');
  g.renderMarket();
  document.getElementById('baitOverlay').classList.remove('hidden');
  const cards = Array.from(document.querySelectorAll('#baitRow .bait-card'));
  return cards.map((c) => ({ html: c.innerHTML.slice(0, 200), hasSvg: !!c.querySelector('svg') }));
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: OUT + 'ui_market.png' });
const mbox = await page.evaluate(() => {
  const el = document.querySelector('#baitRow');
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
await page.screenshot({ path: OUT + 'ui_market_zoom.png', clip: { x: mbox.x, y: mbox.y, width: mbox.w, height: Math.min(mbox.h, 300) } });

console.log(JSON.stringify({ pondInfo, mktInfo }, null, 1));
console.log('ERRS ' + errs.length + (errs.length ? ' :: ' + errs.slice(0, 4).join(' | ') : ''));
await browser.close();
