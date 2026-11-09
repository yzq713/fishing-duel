import puppeteer from 'puppeteer-core';

const V = Date.now();
const ROOT = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/';
const OUT = 'D:/下载/fishprobe/';
const errs = [];
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--allow-file-access-from-files']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.setCacheEnabled(false);
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise((r) => setTimeout(r, 2800));

// 造一点家底：鱼、鱼饵、杂物
await page.evaluate(() => {
  const E = window.Economy;
  E.balance = 8000;
  E.baits = { worm: 14, shrimp: 8, lure: 3, secret: 0 };
  E.baitSel = 'worm';
  E.fishBag = [
    { name: '锦鲤', points: 92, tier: 3, sea: false, dist: 12, t: Date.now() },
    { name: '水晶锦鲤', points: 150, tier: 4, sea: false, dist: 21, t: Date.now() },
    { name: '星界鳐', points: 2400, tier: 8, sea: true, dist: 63, t: Date.now() }
  ];
  E.items = [
    { name: '珍珠', kind: '珍宝', sea: true, t: Date.now() },
    { name: '贝壳', kind: '材料', sea: false, t: Date.now() },
    { name: '海藻', kind: '材料', sea: false, t: Date.now() }
  ];
  ['苍龙', '锦鲤', '锦鲤'].forEach((n) => {
    const e = E.addPondFish(n, n === '苍龙' ? 3200 : 92, n === '苍龙' ? 7 : 3);
    window.game.world.addPondFish(n, e.points, e.id, e.tier);
  });
  E.save();
});

// 进游戏
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise((r) => setTimeout(r, 2200));

// ---- 鱼市（有鱼可卖）----
await page.evaluate(() => {
  window.game.state = 'playing';
  window.game.toggleInGameOverlay('bait');
});
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: OUT + 'mk_market2.png' });

// ---- 背包（有鱼饵、有杂物）----
await page.evaluate(() => {
  const g = window.game;
  g.overlayKind = null;
  document.getElementById('baitOverlay').classList.add('hidden');
  g.overlaySource = 'game';
  document.getElementById('backpackOverlay').classList.remove('hidden');
  g.renderBackpack();
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: OUT + 'mk_bag3.png' });

// ---- 观鱼台：站到岸上回看整个台子 ----
const deck = await page.evaluate(() => {
  const g = window.game;
  g.overlayKind = null;
  document.getElementById('backpackOverlay').classList.add('hidden');
  g.state = 'playing';
  g.locked = true;
  const d = g.world.pondDeck;
  const r = Math.hypot(d.x, d.z);
  const ux = d.x / r, uz = d.z / r;
  // 从陆地一侧后退 8m，回头看向台子
  const px = d.x + ux * 8.2, pz = d.z + uz * 8.2;
  g.player.pos.set(px, g.world.heightAt(px, pz) + 0.1, pz);
  g.player.yaw = Math.atan2(-(d.x - px), -(d.z - pz));
  g.player.pitch = -0.10;
  g.player.selectSlot(2);
  g.player.thirdPerson = false;
  return { deck: d, from: [px.toFixed(1), pz.toFixed(1)] };
});
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: OUT + 'mk_deck2.png' });

// ---- 观鱼台面板 ----
await page.evaluate(() => {
  const g = window.game;
  g.state = 'paused';
  g.overlaySource = 'game';
  g.overlayKind = 'pond';
  g.renderPond();
  document.getElementById('pondOverlay').classList.remove('hidden');
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: OUT + 'mk_pond2.png' });

console.log(JSON.stringify({ deck }, null, 1));
console.log('ERRS ' + errs.length + (errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''));
await browser.close();
