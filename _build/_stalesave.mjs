import puppeteer from 'puppeteer-core';
const V = Date.now();
const ROOT = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/';
const OUT = 'D:/下载/fishprobe/';
const errs = [];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'domcontentloaded' });
// 造一个「旧版本」存档：拿着已删掉的 smg/amr，鱼竿已经买到星辉竿
await page.evaluate(() => {
  localStorage.setItem('fishingDuel.economy.v1', JSON.stringify({
    balance: 20000,
    ownedGuns: ['rifle', 'smg', 'sniper', 'amr', 'revolver', 'db'],
    loadout: ['smg', 'amr'],
    ownedRods: ['bamboo', 'carbon', 'master', 'glass', 'abyss', 'crystal', 'dragon', 'astral'],
    rod: 'astral',
    ammoStock: 240,
    fishBag: [], items: [], bagId: 'cloth', ownedBags: ['cloth'], bait: 3,
    pondFish: [], raised: 0, character: 'angler', codex: {},
    stats: { games: 4, kills: 9, headshots: 2, catches: 12, totalScore: 5400, best: 900 }
  }));
});
await page.setCacheEnabled(false);
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 2600));
const out = await page.evaluate(() => {
  const E = window.Economy, g = window.game;
  return {
    ownedGuns: E.ownedGuns, loadout: E.loadout, rodPeak: E.rodPeak, rod: E.rod,
    gameLoadout: g.loadout, loadoutSel: g.loadoutSel, slots: g.player.slots,
    gun: g.player.gun.id
  };
});
console.log('STALE ' + JSON.stringify(out));
// 图鉴/战绩面板正常
await page.evaluate(() => { window.game.renderStats(); document.getElementById('statsOverlay').classList.remove('hidden'); });
await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: OUT + 'fx_stats2.png' });
// 进游戏开一枪（手枪）确认能开火
await page.evaluate(() => {
  document.getElementById('statsOverlay').classList.add('hidden');
  window.game.startRound();
});
await new Promise(r => setTimeout(r, 1800));
const fire = await page.evaluate(() => {
  const g = window.game;
  const before = g.player.ammo;
  g.input.fire = true;
  return { before, gun: g.player.gun.id, state: g.state };
});
await new Promise(r => setTimeout(r, 300));
const after = await page.evaluate(() => ({ ammo: window.game.player.ammo, score: window.game.score }));
await page.evaluate(() => { window.game.input.fire = false; });
console.log('FIRE ' + JSON.stringify({ ...fire, ...after }));
console.log('ERRS ' + errs.length + (errs.length ? ' :: ' + errs.slice(0,3).join(' | ') : ''));
await browser.close();
