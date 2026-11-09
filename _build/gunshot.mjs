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
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.setCacheEnabled(false);
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise((r) => setTimeout(r, 3000));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise((r) => setTimeout(r, 2500));

// 站到空地上，面朝海，隐藏 HUD，逐把枪拍
const ids = ['pistol', 'shotgun', 'rifle', 'sniper', 'minigun', 'railgun'];
for (const id of ids) {
  await page.evaluate((gid) => {
    const g = window.game;
    window.Economy.ownedGuns = ['pistol', 'shotgun', 'rifle', 'sniper', 'minigun', 'railgun'];
    g.player.setLoadout([gid, null]);
    g.player.applySlot();
    g.player.aiming = false; g.player.aimBlend = 0;
    g.player.thirdPerson = false;
    g.player.pos.set(-30, 0, -6);
    g.player.yaw = -Math.PI / 2; g.player.pitch = -0.02;
    document.getElementById('hud').classList.add('hidden');
    g.updateHud();
  }, id);
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: OUT + 'gun_' + id + '.png' });
}
const info = await page.evaluate(() => {
  const g = window.game;
  return {
    models: Object.keys(g.player.weaponModels),
    muzzles: Object.keys(g.player.weaponMuzzles),
    gun: g.player.gun.id
  };
});
console.log('INFO ' + JSON.stringify(info));
console.log('ERRS ' + errs.length + (errs.length ? ' :: ' + errs[0] : ''));
await browser.close();
