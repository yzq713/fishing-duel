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
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.setCacheEnabled(false);
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise((r) => setTimeout(r, 3000));

const base = await page.evaluate(() => {
  const g = window.game;
  return {
    enemyClass: typeof window.Enemy,
    enemyField: typeof g.enemy,
    guns: Object.keys(window.GUNS),
    ownedGuns: window.Economy.ownedGuns,
    loadout: window.Economy.loadout,
    slots: g.player.slots,
    rod: window.Economy.rod,
    rodPeak: window.Economy.rodPeak,
    stamina: g.player.stamina,
    modeTag: document.getElementById('modeTag').textContent,
    gunName: document.getElementById('gunName').textContent,
    title: document.title,
    eyebrow: document.querySelector('#startOverlay .eyebrow').textContent,
    has1v1: document.body.innerText.indexOf('1v1') >= 0 || document.body.innerText.indexOf('1V1') >= 0
  };
});
console.log('BASE ' + JSON.stringify(base));

await page.screenshot({ path: OUT + 'fx_home.png' });

// 进游戏：单人 → 选角色 → 开钓
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise((r) => setTimeout(r, 2600));

const ingame = await page.evaluate(() => {
  const g = window.game;
  return {
    state: g.state,
    slot: g.player.slot,
    gun: g.player.gun.id,
    ammo: g.player.ammo,
    stamina: +g.player.stamina.toFixed(1),
    modeTag: document.getElementById('modeTag').textContent,
    hpNum: document.getElementById('hpNum').textContent
  };
});
console.log('INGAME ' + JSON.stringify(ingame));
await page.evaluate(() => { window.game.player.shake = 0; });
await page.screenshot({ path: OUT + 'fx_hud.png' });

// 武器商店：几把枪
await page.evaluate(() => {
  const g = window.game;
  g.state = 'paused';
  g.renderShop();
  document.getElementById('weaponOverlay').classList.remove('hidden');
});
await new Promise((r) => setTimeout(r, 400));
const shop = await page.evaluate(() => ({
  cards: Array.from(document.querySelectorAll('#gunGrid .gun-card')).map((c) => c.querySelector('.p-name') ? c.querySelector('.p-name').textContent : c.textContent.slice(0, 12)),
  n: document.querySelectorAll('#gunGrid .gun-card').length
}));
console.log('SHOP ' + JSON.stringify(shop));
await page.screenshot({ path: OUT + 'fx_shop.png' });

// 鱼竿商店
await page.evaluate(() => {
  document.getElementById('weaponOverlay').classList.add('hidden');
  window.game.tradeKind = 'rod';
  window.game.renderTrade('rod');
  document.getElementById('tradeOverlay').classList.remove('hidden');
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: OUT + 'fx_rod.png' });
const rodSub = await page.evaluate(() => document.getElementById('tradeSub').textContent);
console.log('RODSUB ' + JSON.stringify(rodSub));

// 核心规则：买枪 → 升级鱼竿 → 枪没了
const rule = await page.evaluate(() => {
  const E = window.Economy;
  document.getElementById('tradeOverlay').classList.add('hidden');
  E.balance = 80000;
  const log = [];
  log.push(['start', E.ownedGuns.slice(), E.rodPeak]);
  E.buyGun('rifle'); log.push(['buy rifle', E.ownedGuns.slice()]);
  E.buyGun('shotgun'); log.push(['buy shotgun', E.ownedGuns.slice()]);
  E.buyRod('carbon'); log.push(['buy carbon(1)', E.ownedGuns.slice(), E.rodPeak]);
  E.buyGun('sniper'); log.push(['buy sniper', E.ownedGuns.slice()]);
  E.equipRod('bamboo'); // 换上低一档：不该再重置
  E.equipRod('carbon');
  log.push(['re-equip carbon', E.ownedGuns.slice(), E.rodPeak]);
  E.buyRod('master'); log.push(['buy master(2)', E.ownedGuns.slice(), E.rodPeak]);
  E.buyRod('glass'); log.push(['buy glass(3)', E.ownedGuns.slice(), E.rodPeak]);
  return {
    log,
    loadout: E.loadout,
    gameLoadout: window.game.loadout,
    playerSlots: window.game.player.slots.slice(),
    ownedRods: E.ownedRods
  };
});
console.log('RULE ' + JSON.stringify(rule));

// 战绩面板
await page.evaluate(() => {
  window.game.state = 'paused';
  window.game.renderStats();
  document.getElementById('statsOverlay').classList.remove('hidden');
});
await new Promise((r) => setTimeout(r, 400));
const stats = await page.evaluate(() => Array.from(document.querySelectorAll('#statsGrid .stat-card')).map((c) => c.textContent));
console.log('STATS ' + JSON.stringify(stats));
await page.screenshot({ path: OUT + 'fx_stats.png' });

// 打鸟/打鱼：直接调 hitPrey 扫一圈，确认还有猎物可打
const prey = await page.evaluate(() => {
  const g = window.game;
  document.getElementById('statsOverlay').classList.add('hidden');
  g.state = 'playing';
  const alive = g.world.birds.filter((b) => b.alive).length;
  const b = g.world.birds.find((x) => x.alive);
  const p = b.group.position;
  const from = new window.THREE.Vector3(p.x + 12, p.y, p.z + 12);
  const dir = p.clone().sub(from).normalize();
  const hit = g.hitPrey(from, dir, 40);
  let killed = null;
  if (hit) { hit.kill(); killed = { label: hit.label, points: hit.points }; }
  return { birds: alive, hit: !!hit, killed, birdsAfter: g.world.birds.filter((x) => x.alive).length };
});
console.log('PREY ' + JSON.stringify(prey));

// 帧率
const perf = await page.evaluate(() => new Promise((res) => {
  const arr = [];
  let last = performance.now();
  let n = 0;
  function tick() {
    const now = performance.now();
    arr.push(now - last);
    last = now;
    if (++n < 160) requestAnimationFrame(tick);
    else {
      arr.sort((a, b) => a - b);
      res({ p50: +arr[80].toFixed(1), p90: +arr[144].toFixed(1), max: +arr[159].toFixed(1) });
    }
  }
  requestAnimationFrame(tick);
}));
console.log('PERF ' + JSON.stringify(perf));
console.log('ERRS ' + errs.length + (errs.length ? ' :: ' + errs.slice(0, 4).join(' | ') : ''));

await browser.close();
