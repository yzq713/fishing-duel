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

// ---- 1) 进游戏 ----
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise((r) => setTimeout(r, 2200));

// 给点本钱（新档余额是 0）
await page.evaluate(() => { window.Economy.balance = 6000; window.Economy.save(); });

// ---- 2) 鱼市浮层：买饵 ----
const before = await page.evaluate(() => ({
  balance: window.Economy.balance, baits: { ...window.Economy.baits }, sel: window.Economy.baitSel
}));
await page.evaluate(() => window.game.toggleInGameOverlay('bait'));
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: OUT + 'mk_market.png' });
const cards = await page.evaluate(() =>
  Array.from(document.querySelectorAll('#baitRow .bait-card')).map((c) => ({
    bait: c.dataset.bait, n: c.dataset.n, cost: c.dataset.cost,
    text: c.textContent.replace(/\s+/g, ' ').trim()
  })));
await page.evaluate(() => {
  const c = document.querySelector('#baitRow .bait-card[data-bait="secret"]');
  if (c) c.click();
});
await new Promise((r) => setTimeout(r, 400));
const afterBuy = await page.evaluate(() => ({
  balance: window.Economy.balance, baits: { ...window.Economy.baits }
}));

// ---- 3) 背包：装钩 ----
await page.evaluate(() => {
  window.game.overlayKind = null;
  window.game.overlaySource = 'game';
  document.getElementById('baitOverlay').classList.add('hidden');
  document.getElementById('backpackOverlay').classList.remove('hidden');
  window.game.renderBackpack();
});
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: OUT + 'mk_bag.png' });
const baitRows = await page.evaluate(() =>
  Array.from(document.querySelectorAll('#bpBaits .bait-chip')).map((c) => c.textContent.replace(/\s+/g, ' ').trim()));
await page.evaluate(() => {
  const b = document.querySelector('#bpBaits .bait-chip .bait-use:not([disabled])');
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 350));
const afterLoad = await page.evaluate(() => {
  window.game.player.selectSlot(2);
  window.game.updateHud();
  return {
    sel: window.Economy.baitSel,
    count: window.Economy.baitSel ? window.Economy.baitCount(window.Economy.baitSel) : 0,
    hud: document.getElementById('ammoLabel').textContent + ' ' + document.getElementById('ammoNum').textContent
  };
});
await page.screenshot({ path: OUT + 'mk_bag2.png' });

// ---- 4) 抽取概率：空钩 vs 秘制香饵 ----
const dist = await page.evaluate(() => {
  const g = window.game;
  const f = g.fishing;
  const run = (cfg, castD, n) => {
    const old = f.baitCfg;
    f.baitCfg = cfg; f.castDist = castD; f.seaCast = false;
    const tally = {};
    for (let i = 0; i < n; i++) {
      const p = f.pickFish();
      const gr = p.tier;
      tally[gr] = (tally[gr] || 0) + 1;
    }
    f.baitCfg = old;
    return tally;
  };
  return {
    none30: run(null, 30, 400),
    worm30: run({ cap: 3, luck: 1.0 }, 30, 400),
    shrimp30: run({ cap: 5, luck: 1.7 }, 30, 400),
    lure30: run({ cap: 7, luck: 2.5 }, 30, 400),
    secret30: run({ cap: 9, luck: 3.6 }, 30, 400),
    none8: run(null, 8, 400)
  };
});

// ---- 5) 背包：卖杂物 ----
const sellItem = await page.evaluate(() => {
  const eco = window.Economy;
  eco.items.push({ name: '珍珠', kind: '珍宝', sea: true, t: Date.now() });
  eco.items.push({ name: '贝壳', kind: '材料', sea: false, t: Date.now() });
  window.game.renderBackpack();
  const bal0 = eco.balance;
  const btn = document.querySelector('#bpItems .fc-sell');
  if (!btn) return { err: 'no sell button' };
  btn.click();
  return { bal0, bal1: eco.balance, items: eco.items.map((i) => i.name) };
});

// ---- 6) 鱼市：卖鱼 ----
const sellFish = await page.evaluate(() => {
  const eco = window.Economy;
  eco.fishBag = [
    { name: '锦鲤', points: 92, tier: 3, sea: false, dist: 12, t: Date.now() },
    { name: '星界鳐', points: 2400, tier: 8, sea: true, dist: 63, t: Date.now() }
  ];
  window.game.overlayKind = null;
  document.getElementById('backpackOverlay').classList.add('hidden');
  document.getElementById('baitOverlay').classList.remove('hidden');
  window.game.renderMarket();
  const bal0 = eco.balance;
  const btn = document.querySelector('#sellFishList .mkt-sell');
  if (!btn) return { err: 'no fish sell button' };
  btn.click();
  const afterOne = { bal: eco.balance, n: eco.fishBag.length };
  document.getElementById('sellAllFish').click();
  return { bal0, afterOne, bal2: eco.balance, n: eco.fishBag.length };
});

// ---- 7) 观鱼台：选址 / 交互 / 面板 ----
const deck = await page.evaluate(() => {
  const g = window.game;
  const d = g.world.pondDeck;
  if (!d) return { err: 'no deck' };
  document.getElementById('baitOverlay').classList.add('hidden');
  g.overlayKind = null;
  g.state = 'playing';
  g.locked = true;
  // 站到台子靠岸一侧
  const r = Math.hypot(d.x, d.z);
  const ux = d.x / r, uz = d.z / r;
  const px = d.x + ux * 1.4, pz = d.z + uz * 1.4;
  g.player.pos.set(px, g.world.heightAt(px, pz) + 0.1, pz);
  g.player.yaw = Math.atan2(d.x - px, d.z - pz) + Math.PI;
  g.player.pitch = -0.12;
  g.player.selectSlot(2);
  return { deck: d, player: [px.toFixed(2), pz.toFixed(2)], near: (g.nearestShop() || {}).kind };
});
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: OUT + 'mk_deck.png' });
const hint = await page.evaluate(() => document.getElementById('interactTip').textContent);
await page.evaluate(() => window.game.interact());
await new Promise((r) => setTimeout(r, 600));
const pondOpen = await page.evaluate(() => ({
  hidden: document.getElementById('pondOverlay').classList.contains('hidden'),
  count: document.getElementById('pondCount').textContent,
  rate: document.getElementById('pondRate').textContent,
  body: document.getElementById('pondBody').textContent.replace(/\s+/g, ' ').trim().slice(0, 180)
}));
// 放两条鱼进去再看
await page.evaluate(() => {
  const eco = window.Economy;
  ['锦鲤', '苍龙'].forEach((n) => {
    const e = eco.addPondFish(n, n === '苍龙' ? 3200 : 92, n === '苍龙' ? 7 : 3);
    window.game.world.addPondFish(n, e.points, e.id, e.tier);
  });
  window.game.renderPond();
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: OUT + 'mk_pond.png' });
const pondAfter = await page.evaluate(() => ({
  count: document.getElementById('pondCount').textContent,
  rate: document.getElementById('pondRate').textContent,
  body: document.getElementById('pondBody').textContent.replace(/\s+/g, ' ').trim()
}));

// ---- 8) 真实抛竿一竿：确认消耗一份饵 ----
const cast = await page.evaluate(() => {
  const eco = window.Economy;
  document.getElementById('pondOverlay').classList.add('hidden');
  window.game.overlayKind = null;
  window.game.state = 'playing';
  const before = { sel: eco.baitSel, n: eco.baitCount('secret') };
  window.game.player.selectSlot(2);
  window.game.fishing.cooldown = 0;
  window.game.fishing.startCharge();
  window.game.fishing.begin({ sea: false }, 10);
  return { before, after: { sel: eco.baitSel, n: eco.baitCount('secret') }, cfg: !!window.game.fishing.baitCfg };
});

console.log(JSON.stringify({ cards, before, afterBuy, baitRows, afterLoad, dist, sellItem, sellFish, deck, hint, pondOpen, pondAfter, cast }, null, 1));
console.log('ERRS ' + errs.length + (errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''));
await browser.close();
