import puppeteer from 'puppeteer-core';
const V = Date.now();
const DIR = 'D:/下载/fishprobe/';
const URL = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=' + V;
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--window-size=1280,760']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => { errs.push(String(e).slice(0, 200)); console.log('[err]', String(e).slice(0, 200)); });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.setCacheEnabled(false);
await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 3600));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 1800));
await page.evaluate(() => {
  const g = window.game; g.state = 'playing';
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach(k => { if (g.ui[k]) g.ui[k].classList.add('hidden'); });
  // 直接放两条进湖
  window.Economy.pondFish = [
    { name: '苍龙', points: 3200, tier: 7 },
    { name: '恐龙', points: 3800, tier: 7 }
  ];
  g.world.rebuildPondFish ? g.world.rebuildPondFish() : null;
});
// 若没有 rebuild，用背包路径再放一次
const n = await page.evaluate(() => window.game.world.fishes.length);
if (!n) {
  await page.evaluate(() => {
    const g = window.game;
    window.Economy.fishBag = [{ name: '苍龙', points: 3200, tier: 7 }, { name: '恐龙', points: 3800, tier: 7 }];
    g.renderBackpack();
    document.getElementById('backpackOverlay').classList.remove('hidden');
    for (let i = 0; i < 6; i++) { const b = document.querySelector('#bpFish .fc-raise'); if (!b) break; b.click(); }
    document.getElementById('backpackOverlay').classList.add('hidden');
    g.state = 'playing';
  });
}
console.log('fishes', await page.evaluate(() => window.game.world.fishes.map(f => f.name + ' len' + f.model.len.toFixed(2) + ' y' + f.swimY.toFixed(3))));

const show = async (tag, pose) => {
  await page.evaluate((p) => {
    const g = window.game, pl = g.player;
    const fs = g.world.fishes;
    fs.forEach((f, i) => {
      const cfg = p.fish[i % p.fish.length];
      f.ang = cfg.a; f.r = cfg.r; f.speed = 0.01; f.wobble = 0;
      if (f.pos) f.pos.set(Math.cos(f.ang) * f.r, f.swimY, Math.sin(f.ang) * f.r);
      f.group.rotation.y = cfg.yaw;
    });
    pl.pos.set(p.px, p.py, p.pz);
    if (pl.vel) pl.vel.set(0, 0, 0);
    const tx = p.tx, ty = p.ty, tz = p.tz;
    const dx = tx - pl.pos.x, dy = ty - (pl.pos.y + 1.66), dz = tz - pl.pos.z;
    const L = Math.hypot(dx, dz);
    pl.yaw = Math.atan2(-dx / L, -dz / L);
    pl.pitch = Math.atan2(dy, L);
  }, pose);
  await new Promise(r => setTimeout(r, 900));
  await page.screenshot({ path: DIR + '_' + tag + '.png' });
  console.log('shot', tag);
};

// 玩家会被碰撞推到岸边（z≈9.4），所以鱼要摆在近岸 +Z 一侧才拍得到
await show('p_near', {
  fish: [{ a: 1.42, r: 5.4, yaw: 0 }, { a: 1.66, r: 6.5, yaw: 0 }],
  px: 0.3, py: 0.30, pz: 9.4, tx: 0.0, ty: -0.15, tz: 5.6
});
await show('p_side', {
  fish: [{ a: 1.38, r: 4.9, yaw: 0 }, { a: 1.74, r: 6.1, yaw: 0 }],
  px: 0.1, py: 0.28, pz: 9.4, tx: 0.2, ty: -0.10, tz: 5.0
});
await show('p_top', {
  fish: [{ a: 1.45, r: 5.6, yaw: 0 }, { a: 1.70, r: 6.8, yaw: 0 }],
  px: 0.2, py: 2.9, pz: 9.6, tx: 0.0, ty: -0.4, tz: 5.4
});
console.log('errs', errs.length);
await browser.close();
