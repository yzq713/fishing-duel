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
  E.baitSel = 'lure';
  E.fishBag = [
    { name: '锦鲤', points: 92, tier: 3, sea: false, dist: 12, t: Date.now() },
    { name: '深海皇带鱼', points: 1500, tier: 7, sea: true, dist: 40, t: Date.now() }
  ];
  E.items = [{ name: '珍珠', kind: '珍宝', sea: true, t: Date.now() }];
  [['苍龙', 3200, 7], ['锦鲤', 92, 3], ['小银鱼', 20, 0], ['深海皇带鱼', 1500, 7]].forEach(([n, p, t]) => {
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

// ---- 图标大图 ----
await page.evaluate(() => {
  const g = window.game;
  const wrap = document.createElement('div');
  wrap.id = '_icstrip';
  wrap.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#f4efe2;padding:10px;display:flex;gap:12px';
  ['worm', 'shrimp', 'lure', 'secret'].forEach((id) => {
    const d = document.createElement('div');
    d.style.cssText = 'width:110px;height:110px;display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid #ccc';
    d.innerHTML = g.baitIcon(id, 92);
    wrap.appendChild(d);
  });
  document.body.appendChild(wrap);
});
await new Promise((r) => setTimeout(r, 250));
await page.screenshot({ path: OUT + 'ui_bait_big.png', clip: { x: 0, y: 0, width: 520, height: 130 } });
await page.evaluate(() => { const el = document.getElementById('_icstrip'); if (el) el.remove(); });

// ---- HUD：拿竿 + 挂亮片 ----
await page.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach((k) => { if (g.ui[k]) g.ui[k].classList.add('hidden'); });
  g.player.selectSlot(2);
  g.updateHud();
});
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: OUT + 'ui_hud.png', clip: { x: 880, y: 600, width: 400, height: 150 } });

// ---- 鱼市 ----
await page.evaluate(() => {
  const g = window.game;
  g.toggleInGameOverlay('bait');
});
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: OUT + 'ui_market2.png' });

// ---- 背包 ----
await page.evaluate(() => {
  const g = window.game;
  g.overlayKind = null;
  document.getElementById('baitOverlay').classList.add('hidden');
  g.overlaySource = 'game';
  document.getElementById('backpackOverlay').classList.remove('hidden');
  g.renderBackpack();
});
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: OUT + 'ui_bag2.png' });

// ---- 观鱼台 ----
await page.evaluate(() => {
  const g = window.game;
  g.overlayKind = 'pond';
  document.getElementById('backpackOverlay').classList.add('hidden');
  g.renderPond();
  document.getElementById('pondOverlay').classList.remove('hidden');
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: OUT + 'ui_pond2.png' });

console.log('ERRS ' + errs.length + (errs.length ? ' :: ' + errs.slice(0, 4).join(' | ') : ''));
await browser.close();
