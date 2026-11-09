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

// 老存档：只有 bait: 7，没有 baits / baitSel
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('fishingDuel.economy.v1', JSON.stringify({
    balance: 3000, ownedGuns: ['pistol'], loadout: ['pistol'],
    ownedRods: ['bamboo', 'carbon'], rod: 'carbon', rodPeak: 1,
    ammoStock: 60, fishBag: [{ name: '小银鱼', points: 20, tier: 0, dist: 3 }],
    items: [{ name: '珍珠', kind: '珍宝' }], bagId: 'cloth', ownedBags: ['cloth'],
    bait: 7, pondFish: [], raised: 0, character: 'angler', codex: {}, stats: {}
  }));
});
await page.setCacheEnabled(false);
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise((r) => setTimeout(r, 2600));

const migrated = await page.evaluate(() => ({
  baits: { ...window.Economy.baits },
  total: window.Economy.totalBait(),
  sel: window.Economy.baitSel,
  fish: window.Economy.fishBag.length,
  items: window.Economy.items.map((i) => i.name)
}));

// 进游戏，看 HUD 空钩
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise((r) => setTimeout(r, 2200));
await page.evaluate(() => { window.game.player.selectSlot(2); window.game.updateHud(); });
await new Promise((r) => setTimeout(r, 200));
const hudEmpty = await page.evaluate(() => ({
  label: document.getElementById('ammoLabel').textContent,
  num: document.getElementById('ammoNum').textContent
}));

// 空钩抛一竿：看提示与消耗
const castEmpty = await page.evaluate(() => {
  const g = window.game;
  g.fishing.cooldown = 0;
  g.fishing.startCharge();
  g.fishing.begin({ sea: false }, 9);
  return {
    cfg: g.fishing.baitCfg,
    notes: Array.from(document.querySelectorAll('#notices .notice')).map((n) => n.textContent.replace(/\s+/g, ' ').trim()).slice(0, 3),
    baits: { ...window.Economy.baits }
  };
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: OUT + 'mk_emptycast.png' });

// 装钩后再抛一竿
const castBait = await page.evaluate(() => {
  const g = window.game;
  const E = window.Economy;
  g.fishing.cleanup();
  g.fishing.cooldown = 0;
  E.loadBait('worm');
  g.fishing.startCharge();
  g.fishing.begin({ sea: false }, 9);
  return {
    cfg: g.fishing.baitCfg,
    worm: E.baitCount('worm'),
    sel: E.baitSel,
    notes: Array.from(document.querySelectorAll('#notices .notice')).map((n) => n.textContent.replace(/\s+/g, ' ').trim()).slice(0, 3)
  };
});

// 鱼市招牌近景
const shop = await page.evaluate(() => {
  const g = window.game;
  g.fishing.cleanup();
  const s = g.world.baitShop;
  const r = Math.hypot(s.x, s.z);
  // 摊位正面朝湖心：站到靠湖那一侧才看得到招牌和柜台
  const px = s.x - (s.x / r) * 7.2, pz = s.z - (s.z / r) * 7.2;
  g.player.pos.set(px, g.world.heightAt(px, pz) + 0.1, pz);
  g.player.yaw = Math.atan2(-(s.x - px), -(s.z - pz));
  g.player.pitch = 0.02;
  g.player.selectSlot(2);
  return { shop: s, from: [px.toFixed(1), pz.toFixed(1)] };
});
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: OUT + 'mk_shop.png' });

console.log(JSON.stringify({ migrated, hudEmpty, castEmpty, castBait, shop }, null, 1));
console.log('ERRS ' + errs.length + (errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''));
await browser.close();
